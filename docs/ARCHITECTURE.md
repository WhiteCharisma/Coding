# Architecture

Creator Network is a **single-process monolith** designed for one modest Linux VPS.

```
 Browser (React SPA)
   │  HTTPS (REST /api/*)        WSS (Socket.IO /socket.io/*)
   ▼                                   ▼
 ┌────────────────────── Caddy 2 (TLS, compression) ──────────────────────┐
 └───────────────────────────────┬────────────────────────────────────────┘
                                 ▼  http://app:3000 (private Docker network)
 ┌──────────────────────── Node.js 24 process ────────────────────────────┐
 │ Fastify 5                                                              │
 │  ├─ /api/*   REST: auth, users, communities, channels, messages,       │
 │  │            DMs, uploads, search, notifications, reports, admin      │
 │  ├─ /api/files/:id   authorised file streaming                         │
 │  └─ /*       static SPA (apps/web/dist) with index.html fallback        │
 │ Socket.IO 4 gateway (same HTTP server)                                  │
 │  ├─ cookie session auth + Origin check at handshake                    │
 │  ├─ rooms: user:<id>, session:<id>, community:<id>, channel:<id>       │
 │  └─ in-memory presence + typing (ephemeral, never written to disk)     │
 │ Services (business rules, authorization) → Drizzle ORM → better-sqlite3│
 │ In-process jobs: session/upload cleanup, scheduled backups             │
 └───────────────┬───────────────────────────────┬────────────────────────┘
                 ▼                               ▼
   ./data/creator-network.sqlite (WAL)     ./data/uploads/xx/yy/<id>
   ./backups/creator-network-<time>.tar.gz (DB snapshot + uploads + manifest)
```

## Stack decisions

| Area | Choice | Why |
|---|---|---|
| Runtime | Node.js 24 LTS in Docker (develop on ≥22.12) | LTS until 2028; better-sqlite3 13 requires ≥22 |
| HTTP | Fastify 5.12 | Fast, schema-friendly, first-party plugins for cookies, rate limits, helmet, multipart, static |
| Real-time | Socket.IO 4.8 | Rooms, acknowledgements, automatic reconnection, WebSocket with HTTP long-polling fallback |
| DB | SQLite 3.53 via better-sqlite3 13 (WAL) | Zero-ops, in-process, fast; FTS5 built in; consistent online backup API |
| ORM | Drizzle 0.45 + drizzle-kit migrations | Type-safe SQL close to the metal; plain SQL migration files committed to Git |
| Validation | Zod 4 schemas in `packages/shared` | One source of truth for server enforcement and client form feedback |
| Passwords | Argon2id (`argon2` 0.45, OWASP params 19 MiB/2/1) | Memory-hard; maintained native binding with prebuilt binaries |
| Frontend | React 19, Vite 8, TypeScript 6, React Router 8 (declarative mode) | Mature, fast builds, code splitting per route |
| Styling | Tailwind CSS 4 + CSS-variable design tokens; Radix primitives in shadcn/ui style | Accessible primitives, original visual identity |
| Client state | Zustand (realtime state), TanStack Query (request/response data) | Fine-grained subscriptions; caching/invalidation without boilerplate |
| Motion | CSS transitions + Motion 12 for enter/exit & layout only | Small cost, respects reduced motion |
| Proxy/TLS | Caddy 2.11 | Automatic HTTPS with Let's Encrypt, simple config |
| Tests | Vitest 5, Playwright 1.56 | Unit/integration + real-browser end-to-end |

TypeScript is pinned to 6.0.x because `typescript-eslint` does not support TypeScript 7 yet.

## Key design decisions

### One "channel" model for community channels and direct messages
`channels.kind` is `text` (belongs to a community), `dm` (exactly two participants,
`dm_key` unique per pair) or `group_dm` (2–10 participants). Messages, reactions, pins,
read states, typing, search and notifications work identically for all three. Access
rules differ and are centralised in `communities/permissions.ts` (`getChannelAccess`).

### Permissions
Discord-style bitfields (`packages/shared/src/permissions.ts`): the owner has everything;
otherwise `@everyone | member roles`; `ADMINISTRATOR` grants everything; channel overwrites
apply in order @everyone → roles → member. A private channel is one where @everyone is
denied `VIEW_CHANNEL`. Role hierarchy: members can only manage roles strictly below their
highest role, and can only grant permissions they hold themselves.

### Message durability and idempotency
1. The client generates a `nonce` per message and keeps it in a local outbox (localStorage).
2. `message:send` (Socket.IO with acknowledgement) → server validates, authorises, writes the
   message in one transaction, and only then acknowledges with the stored message.
3. A retry with the same nonce returns the already stored message (`UNIQUE(author_id, nonce)`),
   so reconnect storms never duplicate messages.
4. The server broadcasts `message:new` to `channel:<id>`; clients de-duplicate by id/nonce.
5. After any reconnect, the client fetches `GET /api/channels/:id/messages?after=<last id>`
   for loaded channels — persisted history, not in-memory socket buffers, is the source of truth.

IDs are monotonic ULIDs generated in-process; because better-sqlite3 is synchronous and there is
one process, commit order equals ID order, so "after <id>" catch-up queries cannot skip rows.

### Real-time authorization
Sockets are joined to `channel:<id>` rooms **by the server** after computing permissions; clients
cannot request arbitrary rooms. Any membership/role/overwrite change triggers `syncUserRooms`
for affected users so revoked access stops real-time delivery immediately. Every socket event
that names a channel re-checks permissions.

### Search
`messages_fts` (FTS5, external content keyed by `messages.seq`, a stable INTEGER PRIMARY KEY).
Queries always join `messages` and filter by the set of channel IDs the user may read.

### Files
Uploads are streamed to a temp file with a size cap, the type is detected from the file
signature (magic bytes) — never the extension — and checked against an allowlist, then moved to
`uploads/<2 chars>/<2 chars>/<ulid>` with no extension. Downloads go through
`GET /api/files/:id` which re-checks channel access and sends `X-Content-Type-Options: nosniff`,
a sandboxing CSP and `Content-Disposition: attachment` for non-media types.

### Data retention
- Deleting a message blanks its content (tombstone keeps reply chains intact); its files are
  removed by the cleanup job.
- Deleting an account anonymises the user row ("Deleted user"), removes sessions, memberships,
  profile data and avatar, and optionally blanks all of the user's messages. Owners must first
  transfer or delete their communities.
- Deleting a community cascades to its channels, messages, roles and invites.
- Expired sessions and unattached uploads (> 1 h) are purged periodically.
- Audit events are kept indefinitely (they contain no message content).

## Scaling envelope and upgrade path

SQLite serialises writes. With WAL and short transactions a single writer comfortably handles
hundreds of small writes per second; measured numbers are in `docs/PERFORMANCE.md`. The first
expected bottlenecks are (1) write throughput during very busy periods and (2) the single Node
process' CPU for fan-out to many sockets. The persistence layer is isolated in services using
Drizzle, so moving to PostgreSQL means swapping the Drizzle driver/dialect and porting the FTS5
search to PostgreSQL full-text search. Horizontal scaling would additionally need the Socket.IO
Redis adapter and shared presence; it is intentionally out of scope for the first release.

## Repository layout

```
apps/server/src/
  main.ts, app.ts, cli.ts, config.ts, context.ts, settings.ts, audit.ts
  db/          schema.ts, client.ts, ids.ts
  lib/         errors, validation, crypto, password, mailer, http helpers, rate limiting
  auth/ users/ communities/ messages/ dms/ notifications/ search/ uploads/ reports/ admin/
  realtime/    Socket.IO gateway, presence, typing
  ops/         health, backup/restore, cleanup jobs
  seed/        demo data generator (procedural artwork + synthesized audio)
apps/server/drizzle/     SQL migrations (committed; applied automatically at startup)
apps/web/src/
  app/ components/ui/ features/<area>/ stores/ lib/ i18n/ styles/
packages/shared/src/     schemas, permissions, constants, types, mentions
deploy/                  Dockerfile, docker-compose.yml, Caddyfile, *.sh scripts
tests/e2e/               Playwright specs
docs/                    architecture, security, deployment, roadmap, reports
```
