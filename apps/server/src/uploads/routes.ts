import fastifyMultipart from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Permission, idSchema } from '@creator-network/shared';
import { requireAuth } from '../auth/plugin';
import { hasPerm, requireChannelPermission, requireCommunityPermission } from '../communities/access';
import { setCommunityIcon } from '../communities/service';
import type { AppContext } from '../context';
import { badRequest, forbidden } from '../lib/errors';
import { rateLimit } from '../lib/http';
import { parse } from '../lib/validation';
import { toAttachmentDTO } from '../messages/service';
import { toSelfUser } from '../users/dto';
import { setAvatar } from '../users/service';
import { authorizeFile, fileDisposition, openFileStream, parseRange, storeUpload, type UploadMeta } from './service';

type IdParams = { Params: { id: string } };

const waveformField = z
  .string()
  .max(1024)
  .transform((v) => {
    try {
      return JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  });

async function readSingleFile(request: FastifyRequest) {
  if (!request.isMultipart()) throw badRequest('Expected a multipart/form-data upload.');
  const data = await request.file();
  if (!data) throw badRequest('No file was attached.');
  const fieldValue = (name: string): string | undefined => {
    const f = data.fields[name];
    const entry = Array.isArray(f) ? f[0] : f;
    return entry && 'value' in entry && typeof entry.value === 'string' ? entry.value : undefined;
  };
  const meta: UploadMeta = {};
  const waveformRaw = fieldValue('waveform');
  if (waveformRaw) {
    const parsed = waveformField.safeParse(waveformRaw);
    if (parsed.success && Array.isArray(parsed.data)) meta.waveform = parsed.data as number[];
  }
  const durationRaw = fieldValue('durationMs');
  if (durationRaw) meta.durationMs = Number(durationRaw);
  return { file: { filename: data.filename, mimetype: data.mimetype, stream: data.file }, meta };
}

export async function registerUploadRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const m = ctx.config.rateLimitMultiplier;
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: ctx.config.maxUploadMbHardLimit * 1024 * 1024,
      files: 1,
      fields: 8,
      fieldSize: 4096,
      parts: 10,
      headerPairs: 100,
    },
  });

  app.post<IdParams>(
    '/api/channels/:id/attachments',
    { config: rateLimit(30 * m, '1 minute') },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const channelId = parse(idSchema, request.params.id);
      const access = requireChannelPermission(ctx.db, channelId, user.id, Permission.SEND_MESSAGES);
      if (!hasPerm(access.permissions, Permission.ATTACH_FILES))
        throw forbidden('You cannot attach files in this channel.');
      const { file, meta } = await readSingleFile(request);
      const row = await storeUpload(ctx, user, file, { purpose: 'attachment', channelId, meta });
      reply.status(201);
      return { attachment: toAttachmentDTO(row) };
    },
  );

  app.post('/api/me/avatar', { config: rateLimit(10 * m, '1 hour') }, async (request) => {
    const { user } = requireAuth(request);
    const { file } = await readSingleFile(request);
    const row = await storeUpload(ctx, user, file, { purpose: 'avatar' });
    return { user: toSelfUser(setAvatar(ctx, user, row.id)) };
  });

  app.delete('/api/me/avatar', async (request) => {
    const { user } = requireAuth(request);
    return { user: toSelfUser(setAvatar(ctx, user, null)) };
  });

  app.post<IdParams>('/api/communities/:id/icon', { config: rateLimit(10 * m, '1 hour') }, async (request) => {
    const { user } = requireAuth(request);
    const communityId = parse(idSchema, request.params.id);
    // Check permission before accepting the upload body.
    requireCommunityPermission(ctx.db, communityId, user.id, Permission.MANAGE_COMMUNITY);
    const { file } = await readSingleFile(request);
    const row = await storeUpload(ctx, user, file, { purpose: 'community_icon' });
    return { community: setCommunityIcon(ctx, user, communityId, row.id) };
  });

  app.delete<IdParams>('/api/communities/:id/icon', async (request) => {
    const { user } = requireAuth(request);
    return { community: setCommunityIcon(ctx, user, parse(idSchema, request.params.id), null) };
  });

  /** Every file download is authorised here; there is no public uploads directory. */
  app.get<IdParams & { Querystring: { download?: string } }>(
    '/api/files/:id',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { user } = requireAuth(request);
      const row = authorizeFile(ctx, user, parse(idSchema, request.params.id));
      const etag = `"${row.id}"`;
      reply
        .header(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
        )
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .header('ETag', etag)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Disposition', fileDisposition(row, request.query.download === '1'));
      if (request.headers['if-none-match'] === etag) return reply.status(304).send();
      const range = parseRange(request.headers.range, row.size);
      if (range === 'invalid') {
        return reply.status(416).header('Content-Range', `bytes */${row.size}`).send();
      }
      reply.type(row.mime);
      if (range) {
        reply
          .status(206)
          .header('Content-Range', `bytes ${range.start}-${range.end}/${row.size}`)
          .header('Content-Length', range.end - range.start + 1);
        return reply.send(openFileStream(ctx, row, range));
      }
      reply.header('Content-Length', row.size);
      return reply.send(openFileStream(ctx, row));
    },
  );
}
