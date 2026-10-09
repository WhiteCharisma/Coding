# Security model

Creator Network is an internet-facing service. This document lists the threats considered,
the safeguards implemented, and what still has to be reviewed before a public launch.
Status markers: ✅ implemented and covered by automated tests · ⚙️ implemented, not
automatically tested · 🔜 not implemented (residual risk).

## Threat model and safeguards

| Threat | Safeguards |
|---|---|
| Account takeover (password guessing) | Argon2id hashing; per-IP rate limits on auth routes; per-account temporary lockout after repeated failures; generic "invalid credentials" errors; timing equalisation for unknown users; common-password blocklist |
| Session theft | 256-bit random tokens; only SHA-256 stored in DB; `HttpOnly`, `SameSite=Lax`, `Secure` + `__Host-` prefix in production; sliding expiry; per-device revocation; all sessions revoked on password reset |
| Unauthorized channel access | Server-side permission computation for every REST call and socket event; 404 for invisible resources; server-managed socket rooms re-synced after permission changes |
| Direct-message disclosure | Participant check on every read/write/subscription; DMs never broadcast outside `channel:<id>` rooms joined by participants |
| Privilege escalation | Platform roles only changeable by admins via audited endpoints; community role hierarchy (cannot assign/edit roles ≥ own highest; cannot grant permissions not held); owner-only ownership transfer with password confirmation |
| Brute force / spam / automation | `@fastify/rate-limit` per route; socket event token buckets (messages, typing, reactions); payload size caps; optional invite-only registration |
| Malicious uploads | Size limits; type detection from magic bytes; allowlist (no SVG/HTML/executables); random storage names outside the web root; `nosniff`, sandbox CSP, attachment disposition; per-request authorization |
| Cross-site scripting | React escaping; message formatting rendered as React elements (no `dangerouslySetInnerHTML`); strict CSP (`script-src 'self'`); links validated to http(s) and opened with `rel="noopener noreferrer nofollow ugc"` |
| Injection | Drizzle parameterised queries; FTS5 query strings sanitised into quoted tokens |
| CSRF | SameSite cookies + mandatory `X-Requested-With: CreatorNetwork` header on state-changing requests + Origin allowlist |
| WebSocket origin attacks (CSWSH) | Socket.IO `allowRequest` rejects handshakes whose `Origin` is not allowed; cookie auth required |
| Resource exhaustion | Body limits (JSON 64 KB, uploads configurable), Socket.IO `maxHttpBufferSize` 64 KB, bounded Argon2 concurrency, paginated history, slow-consumer disconnects, bounded in-memory maps |
| Unauthorized administration | `/api/admin/*` requires platform role on every request; first admin only via server-side CLI; no default credentials; all admin actions audited |
| Backup exposure | Backups written to `./backups` outside any served directory with mode 0600; never under the static root |
| Secret leakage | Secrets only in `.env` (git-ignored); pino redaction of cookies/authorization headers; no secrets in client bundle or `/api/config` |

## Logging and privacy

- Logged: request method, route, status, latency, request id, user id for authenticated requests.
- Never logged: passwords, session tokens, reset/verification tokens, cookies, authorization headers, message content.
- Admin audit log stores actor, action, target and reason — not message content.
- Reports store a snapshot of the reported content so moderators can review it; reporters are told this.

## Encryption

HTTPS (via Caddy) encrypts traffic between browser and server. **Messages are not end-to-end
encrypted**: the server can read them (required for search and moderation). Do not describe the
service as end-to-end encrypted. Disk encryption of the VPS is the operator's responsibility.

## Dependency scanning

Run `npm audit` before every release. At the time of writing it reports 0 known vulnerabilities
(a transitive dev-only `esbuild` advisory in `drizzle-kit` is resolved with an npm `overrides`
entry; drizzle-kit is not installed in the production image).

## Residual risks / required before public launch

- Independent security review / penetration test of auth, permissions and uploads.
- Configure real SMTP and enable "require verified email" to slow down throwaway accounts.
- Uploaded files are not virus-scanned. Consider ClamAV if users exchange archives.
- No CAPTCHA; mass registration is limited only by rate limits and invite-only mode.
- In-memory rate-limit and lockout counters reset on restart.
- Moderation tooling is basic; define community guidelines, a moderation team and an appeal
  address (Admin → Settings → Appeal contact) before inviting the public.
- Legal: privacy policy, terms of service, data-processing obligations for your jurisdiction (e.g. GDPR).
