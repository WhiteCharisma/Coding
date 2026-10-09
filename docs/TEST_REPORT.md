# Test report

Results of the final verification run on **2026-10-09**, against the code of commit `b03dae9`
(documentation-only commits follow it). Every number below comes from an actual run; nothing
is estimated. Raw output is not committed; re-run the commands at the end to reproduce.

## Summary

| Check                               | Result                                                     | Time           |
| ----------------------------------- | ---------------------------------------------------------- | -------------- |
| TypeScript (`npm run typecheck`)    | ✅ 0 errors — all workspaces + E2E sources                 | 18 s           |
| ESLint (`npm run lint`)             | ✅ 0 problems                                              | 12 s           |
| Prettier (`npx prettier --check .`) | ✅ all files formatted                                     | —              |
| Unit + integration (`npm test`)     | ✅ **182 / 182 passed**, 18 files, 0 skipped               | 10.8 s         |
| End-to-end (`npm run test:e2e`)     | ✅ **33 / 33 passed**, 0 flaky, 0 skipped, 0 retries       | 69 s (+ build) |
| Production build (`npm run build`)  | ✅                                                         | —              |
| `npm audit` (production / all deps) | ✅ 0 known vulnerabilities / 0                             | —              |
| Docker deployment (local)           | ✅ see [Deployment verification](#deployment-verification) | —              |

## Environment

- Cloud VM: 4 vCPU (Intel Xeon 2.10 GHz), 15.7 GB RAM, Ubuntu 24.04, Linux 6.18.
- Node.js 22.22.0, npm 10.9.4 (the Docker image uses Node.js 24.21).
- Vitest 5.0.3 (server tests start real servers on random ports with temporary databases;
  web tests run in happy-dom).
- Playwright 1.56.1 with Chromium (revision 1194). Projects: **desktop** (Desktop Chrome,
  1440×900) and **mobile** (Pixel 7 emulation: touch, 412×915). One worker, no retries.
- E2E tests run against the **production build** served by the real server with a fresh,
  throw-away database per run (`e2e/serve.mjs`). Every test fails on any browser console error or
  uncaught exception (automatic fixture).

## Unit and integration tests (Vitest)

| File                                         |   Tests | Covers                                                                                                                                                 |
| -------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/permissions.test.ts`    |       7 | Permission resolution: owner, roles, ADMINISTRATOR, overwrite order, VIEW_CHANNEL, role positions                                                      |
| `packages/shared/src/schemas.test.ts`        |       6 | Mentions, name normalisation, control/bidi stripping, safe links, emoji, registration input                                                            |
| `apps/server/test/auth.test.ts`              |      23 | Registration, Argon2id + hashed tokens, sessions, lockout, CSRF/origin, headers, verification, reset, deletion, registration modes, rate limit         |
| `apps/server/test/communities.test.ts`       |      19 | Templates, visibility (404 not 403), joining, invites (expiry, max uses, direct), channels, overwrites, role hierarchy, kicks, bans, ownership         |
| `apps/server/test/messaging.test.ts`         |      16 | Persistence, idempotent nonces, validation, pagination, edit/delete rights, pins, reactions, replies, mentions, read state, permission denials         |
| `apps/server/test/realtime.test.ts`          |      15 | Socket auth, foreign-origin rejection, connection cap, ack-after-persist, no delivery to non-members, revocation, catch-up, burst limits               |
| `apps/server/test/dms.test.ts`               |       5 | One conversation per pair, participant-only delivery, notifications, blocking, DM policy, group membership                                             |
| `apps/server/test/uploads.test.ts`           |       9 | Authorised serving, magic-byte detection, text sniffing, file-name sanitising, size limit, ownership, ATTACH_FILES, waveform + ranges, avatars         |
| `apps/server/test/admin.test.ts`             |      11 | Admin/moderator access control, suspensions, last-admin protection, reports, reset links, settings, community removal                                  |
| `apps/server/test/search-ops.test.ts`        |       8 | Search (prefix, accents, filters, FTS syntax inert, authorization), readiness, cleanup, restart persistence, backup → restore, corrupt archive refused |
| `apps/server/test/static.test.ts`            |       5 | SPA fallback, cache headers, JSON 404s, database/uploads/backups never served                                                                          |
| `apps/web/src/stores/messages.test.ts`       |       9 | 600-message window in both directions, live appends, ordering, outbox order, same-nonce retries, persistence, sign-out policy                          |
| `apps/web/src/stores/session.test.ts`        |       3 | Sign-out: confirmed, already ended, server unreachable (stays signed in)                                                                               |
| `apps/web/src/styles/tokens.test.ts`         |      30 | WCAG contrast of every text, semantic, on-fill and icon token on every surface, both themes                                                            |
| `apps/web/src/lib/markdown.test.tsx`         |       6 | No HTML injection, safe links, formatting, server-resolved mentions only, highlights, previews                                                         |
| `apps/web/src/lib/cn.test.ts`                |       3 | Class merging keeps colours next to custom sizes                                                                                                       |
| `apps/web/src/i18n/i18n.test.ts`             |       4 | Interpolation, plurals, dotted keys, missing keys                                                                                                      |
| `apps/web/src/features/auth/helpers.test.ts` |       3 | Password strength meter, invite code parsing                                                                                                           |
| **Total**                                    | **182** | 18 files, all passed                                                                                                                                   |

### Negative security tests (selection)

These assert that something is **refused**: unknown users and wrong passwords get identical
errors; accounts lock after repeated failures; privileged fields in a registration request are
ignored; state-changing requests without the CSRF header or from a foreign origin fail;
WebSocket handshakes from foreign origins fail; a 21st simultaneous connection is refused;
non-members never receive messages, cannot read history or single messages (404), cannot
search them and cannot download their files; a kicked member stops receiving immediately; a
revoked session's sockets are disconnected; members cannot change roles, grant permissions they
lack, or act on equal/higher roles; members cannot use any admin endpoint and moderators cannot
change settings or roles; the last administrator cannot be demoted; a disguised executable is
refused by content; files cannot be attached to another user's or channel's messages; reset
tokens never appear in logs or responses; FTS syntax in search input is inert; the database,
uploads and backups are never served.

## End-to-end tests (Playwright)

| Spec                     | Project |  Tests | Scenarios                                                                                                                                                                          |
| ------------------------ | ------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`           | desktop |      4 | Sign-up → onboarding → home; taken username explained inline; wrong password, then redirect to the requested page; sign-out                                                        |
| `communities.spec.ts`    | desktop |      3 | Create a community in the UI and invite a new person who joins via the link; join from Explore; private channels hidden from members                                               |
| `messaging.spec.ts`      | desktop |      4 | Two people: live messages, replies, mentions, reactions, edits, deletions; order after reload; leaving stops delivery; sign-out with unsent messages asks and deletes them         |
| `dms-search.spec.ts`     | desktop |      3 | DM from a profile with a live reply; DM policy "nobody" respected; search never shows other communities                                                                            |
| `attachments.spec.ts`    | desktop |      1 | Audio upload gets a waveform player; image lightbox; outsiders get 404 for files                                                                                                   |
| `security.spec.ts`       | desktop |      6 | Private community isolation (pages, API, files); CSRF/origin; script in a message stays text; cookie flags; disguised executable; security headers                                 |
| `settings-admin.spec.ts` | desktop |      7 | Profile edits; theme/density/motion persist; sign out other devices; members kept out of admin; report → warn flow; invite-only registration with codes; backup from the dashboard |
| `accessibility.spec.ts`  | desktop |      3 | Landmarks, one h1, skip link, labelled images and icon buttons; reduced motion; labelled fields and announced errors                                                               |
| `mobile.spec.ts`         | mobile  |      2 | Bottom navigation, community → channel → message and back; long-press message actions                                                                                              |
| **Total**                |         | **33** | all passed, 0 flaky                                                                                                                                                                |

## Deployment verification

Performed on the development machine with Docker 29.8 and Compose v5.6, using the real
`docker-compose.yml`, `Dockerfile`, `Caddyfile` and `deploy/*.sh` scripts (Caddy served plain
HTTP on local port 8080 because no public domain is available here):

- `install.sh` wrote `.env` (mode 600), built the image, started both containers and waited for
  the health check; `create-admin.sh` created the first administrator.
- Through Caddy: registration, community creation, a WebSocket connection (transport
  `websocket`) and a message delivered as a real-time event.
- `backup.sh` → archive; a message written after the backup; `restore.sh` → the earlier state
  returned, the later message was gone, and the replaced data was moved to
  `data/pre-restore-<time>/` (nothing deleted).
- Data survived `docker compose down` / `up` (container re-creation).
- `update.sh` ran successfully for 7 consecutive commits, each time creating a backup, pulling,
  rebuilding and passing the health check — the last one updating the stack to `b03dae9`, the
  code described in this report. Afterwards the earlier messages were still there and the
  stylesheet served through Caddy contained the new colour tokens.

Not verified: Let's Encrypt certificate issuance and a real Hostinger VPS (see
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)).

## Manual and visual checks

- Screens reviewed in both themes after the final colour changes (sign-in with an error, home,
  a channel with the member list, account settings, the delete-account dialog, admin overview).
- Contrast was audited by script before it became the `tokens.test.ts` suite.

## Not covered

- Firefox and Safari/WebKit (not available in this environment), real phones, screen readers.
- Real SMTP delivery (the tests use the development outbox).
- Load beyond the benchmarks in [PERFORMANCE.md](PERFORMANCE.md); long-running soak tests.

## Reproduce

```bash
npm ci
npm run typecheck && npm run lint && npx prettier --check .
npm test                      # Vitest
npm run test:e2e              # builds, then runs Playwright (Chromium must be installed: npx playwright install chromium)
npm audit
```
