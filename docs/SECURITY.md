# Security model

Creator Network is an internet-facing service. This document lists the threats considered, the
safeguards implemented, how each one is verified, and what still has to happen before a public
launch. Status: ✅ implemented and covered by automated tests · ⚙️ implemented, not covered by
an automated test · 🔜 not implemented (residual risk, see [Before production](#before-production)).

## Threat model and safeguards

| Threat                               | Safeguards                                                                                                                                                                                                                                                                              | Status | Verified by                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Account takeover (password guessing) | Argon2id (19 MiB, 2 passes); per-IP rate limits on auth routes; temporary per-account lockout after repeated failures; identical errors and similar timing for unknown users and wrong passwords; common/username-derived passwords rejected                                            | ✅     | `auth.test.ts` (hash format, lockout, identical errors, strict-mode rate limit, weak passwords)                       |
| Session theft                        | 256-bit random tokens, only their SHA-256 stored; `HttpOnly`, `SameSite=Lax`, and `Secure` + `__Host-` prefix in production; sliding expiry; per-device revocation; all sessions revoked on password reset, other sessions on password change; sockets of revoked sessions disconnected | ✅     | `auth.test.ts`, `realtime.test.ts` (revoked session disconnects), `e2e/security.spec.ts` (cookie flags, no JS access) |
| Unauthorized channel access          | Permissions computed on the server for every REST call and socket event; 404 (not 403) for invisible resources; the server joins sockets to rooms and re-syncs them after membership, role or overwrite changes                                                                         | ✅     | `communities.test.ts`, `messaging.test.ts`, `realtime.test.ts`, `e2e/security.spec.ts`                                |
| Direct-message disclosure            | Participant check on every read, write and subscription; DM events only go to the participants' rooms; blocking and DM privacy settings enforced server-side                                                                                                                            | ✅     | `dms.test.ts`, `e2e/dms-search.spec.ts`                                                                               |
| Privilege escalation                 | Platform roles changeable only by admins (never the last admin or yourself); role hierarchy (cannot edit roles at/above your own or grant permissions you lack); privileged fields in requests ignored; ownership transfer needs the password                                           | ✅     | `admin.test.ts`, `communities.test.ts`, `auth.test.ts` (self-assigned fields ignored)                                 |
| Brute force, spam, automation        | `@fastify/rate-limit` per route; token buckets for socket messages, typing and reactions; payload caps; invite-only and closed registration modes; optional required email verification                                                                                                 | ✅     | `auth.test.ts`, `realtime.test.ts` (message bursts), `admin.test.ts` (registration modes)                             |
| Malicious uploads                    | Size limits; type from magic bytes, never the extension; allowlist (no SVG, HTML or executables); random storage names outside the web root; `nosniff`, sandbox CSP and attachment disposition on download; authorization on every request                                              | ✅     | `uploads.test.ts`, `e2e/security.spec.ts` (disguised executable), `e2e/attachments.spec.ts`                           |
| Cross-site scripting                 | React escaping; message formatting produces React elements (no `dangerouslySetInnerHTML`); CSP `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`; links limited to http(s) with `rel="noopener noreferrer nofollow ugc"`                                               | ✅     | `markdown.test.tsx`, `e2e/security.spec.ts` (script in a message stays text; headers present)                         |
| Injection                            | Drizzle parameterised queries; search input turned into quoted FTS5 tokens; control and bidi-override characters stripped from text                                                                                                                                                     | ✅     | `search-ops.test.ts`, `schemas.test.ts`                                                                               |
| CSRF                                 | `SameSite` cookies + mandatory `X-Requested-With: CreatorNetwork` header on state-changing requests + `Origin` allowlist                                                                                                                                                                | ✅     | `auth.test.ts`, `e2e/security.spec.ts`                                                                                |
| Cross-site WebSocket hijacking       | Socket.IO handshake rejected when `Origin` is not allowed; session cookie required                                                                                                                                                                                                      | ✅     | `realtime.test.ts`                                                                                                    |
| Resource exhaustion                  | JSON body limit 64 KB; Socket.IO message limit 64 KB; upload size limit (admin setting, hard cap in `.env`); bounded Argon2 concurrency; paginated history; at most 20 sockets per account; container memory limit                                                                      | ✅     | `uploads.test.ts` (size limit), `realtime.test.ts` (socket cap)                                                       |
| Slow or stuck socket clients         | Clients whose outgoing buffer keeps growing are disconnected; they reconnect and catch up from history                                                                                                                                                                                  | ⚙️     | Code review (`realtime/gateway.ts`)                                                                                   |
| Unauthorized administration          | `/api/admin/*` checks the platform role on every request; moderators get read/review access only; first admin created only by the server-side CLI; no default credentials; every admin action audited                                                                                   | ✅     | `admin.test.ts`, `e2e/settings-admin.spec.ts`                                                                         |
| Database or backup exposure          | Database, uploads and backups live outside the served directory; unknown paths return JSON 404, never files; backup archives written with mode 600                                                                                                                                      | ✅     | `static.test.ts`, `search-ops.test.ts` (backup/restore)                                                               |
| Secret and token leakage             | Secrets only in `.env` (git-ignored, mode 600 by the installer); log redaction of cookies, authorization headers, passwords and `token` query parameters; nothing secret in the client bundle or `/api/config`; Caddy writes no access log                                              | ✅     | `auth.test.ts` (reset tokens absent from logs and responses)                                                          |
| Information disclosure via health    | Public health endpoints return only `{"status": …}`; details (disk, memory, versions, backups) are for staff in Admin → Overview                                                                                                                                                        | ✅     | `search-ops.test.ts`                                                                                                  |

Other HTTP hardening (set by `@fastify/helmet` in `apps/server/src/app.ts`): HSTS (180 days) and
`upgrade-insecure-requests` when served over HTTPS, `Referrer-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy` disabling camera, microphone,
geolocation, payment and USB, and CSP `frame-ancestors 'none'` against framing (clickjacking).

## Logging and privacy

- **Request logs** (JSON on stdout): request id, method, path with `token` parameters
  redacted, status code and response time. IP addresses, user ids and message contents are not
  written to request logs; cookies, authorization headers and password fields are redacted.
- **Never logged:** passwords, session tokens, reset/verification tokens, cookies, authorization
  headers, message content.
- **Audit log** (database, visible to admins): actor, action, target and reason for every
  administrative and moderation action — never message content.
- **Reports** store a snapshot of the reported content so moderators can review it even if it is
  edited or deleted; reporters are told this.
- Consequence for abuse investigations: you have the audit log, reports and account data, but
  no per-request trail of who did what from where. Add request-level user logging only together
  with a privacy notice and a retention period.

## Encryption

HTTPS (Caddy, Let's Encrypt) encrypts traffic between browser and server. **This is not
end-to-end encryption**: messages and files are stored unencrypted on the server and can be read
by its operator (server-side search and moderation depend on that). Do not describe the service
as end-to-end encrypted. Encrypting the VPS disk and the backup copies is the operator's
responsibility.

## Dependencies and supply chain

- All dependency versions are pinned exactly; `package-lock.json` is committed and the Docker
  build uses `npm ci --ignore-scripts` (prebuilt native binaries, no install scripts).
- `npm audit` (2026-10-09): **0 known vulnerabilities**, production and development
  dependencies. A transitive dev-only `esbuild` advisory in `drizzle-kit` is resolved with an
  npm `overrides` entry; drizzle-kit is not part of the production image.
- The optional `build_ca` BuildKit secret (for building behind a TLS-intercepting proxy) is
  mounted only during `npm ci` and is never stored in an image layer.
- Run `npm audit` before every release and rebuild the image to pick up base-image fixes.

## Known residual risks in this design

- `style-src` allows `'unsafe-inline'` (used by the UI libraries for positioning and
  animation). Scripts are still restricted to `'self'`, which is what blocks script injection.
- Rate-limit counters and login lockouts are kept in memory: a restart resets them.
- Rate limits are per IP; a determined attacker with many addresses is slowed down, not stopped.
- No CAPTCHA, IP bans or automatic spam detection (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).
- Uploaded files are not virus-scanned; ZIP archives are allowed.
- Waveform data is supplied by the uploader's browser (display-only, validated in shape).
- Community owners can name and colour roles freely (for example a role called "Staff"). Platform
  administrators and moderators are marked only on their profile page, not next to their
  messages, so members cannot always tell instance staff from community roles.

## Before production

Do these before inviting people you do not know personally:

1. **Independent security review** of authentication, permissions (REST and socket events), file
   uploads and the admin area — ideally a penetration test. Automated tests are not a substitute.
2. **Deploy on the real VPS** following [DEPLOYMENT.md](DEPLOYMENT.md) and confirm: valid
   certificate, `http://` redirects to `https://`, `APP_ORIGIN` exactly matches the public
   address, the app port (3000) is not reachable from outside, and the response headers listed
   above are present (`curl -sI https://your-domain/`).
3. **Configure SMTP**, then enable "Require verified email" in Admin → Instance settings to slow
   down throwaway accounts; choose the registration mode (invite-only is a good start).
4. **Backups:** schedule an off-server copy, restore one on a test machine, and decide who keeps
   the copies and for how long (they contain all messages and deleted content until rotated out).
5. **Moderation:** write community guidelines, name the moderators, set the appeal contact.
6. **Legal:** privacy policy, terms of service, and the data-protection duties that apply to you
   (for example GDPR: lawful basis, access and erasure requests, data-processing agreements with
   your VPS and email providers). Note that data export is not built in yet.
7. **Keep it updated:** subscribe to security advisories for Node.js, the dependencies and
   Caddy; apply updates with `./deploy/update.sh` (it takes a backup first).
8. **Operational hygiene:** SSH keys instead of passwords, `ufw` or the hPanel firewall
   allowing only 22/80/443, unattended security upgrades for the OS, and a protected copy of `.env`.
