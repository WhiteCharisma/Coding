# Test report

Results of the final verification run for **release 0.2** on **2026-10-09**, against commit
`8802d02` on branch `feature/frutiger-aero-premium-upgrade` (documentation-only commits follow
it). Every number below comes from an actual run; nothing is estimated. Raw output is not
committed; re-run the commands at the end to reproduce.

## Re-run after the Vista Aero Glass redesign (2026-10-09)

Same environment, branch `feature/frutiger-aero-premium-upgrade`, working tree of the Vista
commits (web interface, the presence fix, tests and docs; no dependency, schema or deployment
change).

| Check                           | Result                                                  |
| ------------------------------- | ------------------------------------------------------- |
| TypeScript, ESLint, Prettier    | ✅ 0 errors, 0 problems, all files formatted            |
| Unit + integration (`npm test`) | ✅ **263 / 263 passed**, 28 files, 0 skipped            |
| End-to-end (`npm run test:e2e`) | ✅ **47 passed**, 1 skipped (opt-in TURN test), 0 flaky |
| Production build, `npm audit`   | ✅ / 0 known vulnerabilities                            |

New tests: `e2e/desktop-shell.spec.ts` (Start menu ready to search; minimise, maximise
remembered after a reload, Show desktop, close; Back/Forward, breadcrumb menu, scoped search;
window colour and transparency applied and remembered, blur really off; a mention flashes the
community's taskbar button and its thumbnail says so), `apps/server/test/presence.test.ts`
(reload grace period, other tabs, idle/DND/invisible), `apps/web/src/stores/desktop.test.ts`,
`stores/glass.test.ts` (including the pre-paint script), `features/shell/Wallpaper.test.tsx`
(when the wallpaper moves), new contrast tests for Vista glass in `tokens.test.ts` (58 tests)
and animation merging in `lib/cn.test.ts`. Changed tests, with the reason:

- `e2e/message-layout.spec.ts` measures row heights after the window's opening zoom has ended
  (`windowSettled`): measuring during the zoom read every box 2–4 % small.
- `apps/server/test/realtime.test.ts` queries the presence of a user who never connected: a user
  whose connection just closed now stays online for the reconnect grace period, on purpose.

## Summary

| Check                               | Result                                                                  | Time             |
| ----------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| TypeScript (`npm run typecheck`)    | ✅ 0 errors — all workspaces + E2E sources                              | 21 s             |
| ESLint (`npm run lint`)             | ✅ 0 problems                                                           | 16 s             |
| Prettier (`npx prettier --check .`) | ✅ all files formatted                                                  | —                |
| Unit + integration (`npm test`)     | ✅ **242 / 242 passed**, 24 files, 0 skipped                            | 16 s             |
| End-to-end (`npm run test:e2e`)     | ✅ **42 passed**, 1 skipped (opt-in TURN test, run separately), 0 flaky | 2.7 min (+build) |
| Production build (`npm run build`)  | ✅                                                                      | —                |
| `npm audit` (production / all deps) | ✅ 0 known vulnerabilities / 0                                          | —                |
| Upgrade of a 0.1 install (Docker)   | ✅ see [Deployment verification](#deployment-verification)              | —                |

## Environment

- Cloud VM: 4 vCPU (Intel Xeon 2.10 GHz), 15.7 GB RAM, Ubuntu 24.04, Linux 6.18.
- Node.js 22.22.0, npm 10.9.4 (the Docker image uses Node.js 24.21).
- Vitest 5.0.3 (server tests start real servers on random ports with temporary databases;
  web tests run in happy-dom).
- Playwright 1.56.1 with Chromium 141. Projects: **desktop** (1440×900), **mobile** (Pixel 7
  emulation: touch, 412×915) and **voice** (two browser contexts with Chromium's fake
  microphone playing a stereo test tone). One worker, no retries.
- E2E tests run against the **production build** served by the real server with a fresh,
  throw-away database per run (`e2e/serve.mjs`). Every test fails on any browser console error or
  uncaught exception (automatic fixture).

## Unit and integration tests (Vitest)

| File                                         |   Tests | Covers                                                                                                                                                                                                        |
| -------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/permissions.test.ts`    |       7 | Permission resolution: owner, roles, ADMINISTRATOR, overwrite order, VIEW_CHANNEL, role positions                                                                                                             |
| `packages/shared/src/schemas.test.ts`        |       7 | Mentions, name normalisation, control/bidi stripping, safe links, emoji, registration input, message text normalisation                                                                                       |
| `apps/server/test/auth.test.ts`              |      23 | Registration, Argon2id + hashed tokens, sessions, lockout, CSRF/origin, headers (incl. `microphone=(self)`), verification, reset, registration modes                                                          |
| `apps/server/test/communities.test.ts`       |      19 | Templates, visibility (404 not 403), joining, invites (expiry, max uses, direct), channels, overwrites, role hierarchy, kicks, bans, ownership                                                                |
| `apps/server/test/messaging.test.ts`         |      16 | Persistence, idempotent nonces, validation, pagination, edit/delete rights, pins, reactions, replies, mentions, read state, permission denials                                                                |
| `apps/server/test/realtime.test.ts`          |      15 | Socket auth, foreign-origin rejection, connection cap, ack-after-persist, no delivery to non-members, revocation, catch-up, burst limits                                                                      |
| `apps/server/test/voice.test.ts`             |       8 | **New.** Voice config validation, join rights (404 for outsiders), relay only within a room, one session per account, resume grace, ended on kick, TURN credentials without the secret, room limit, voice off |
| `apps/server/test/media.test.ts`             |       7 | **New.** WebP previews with the original's access rules, GPS/XMP/IPTC removal without re-encoding, retry-safe uploads, `Server-Timing`, late waveforms                                                        |
| `apps/server/test/dms.test.ts`               |       5 | One conversation per pair, participant-only delivery, notifications, blocking, DM policy, group membership                                                                                                    |
| `apps/server/test/uploads.test.ts`           |       9 | Authorised serving, magic-byte detection, text sniffing, file-name sanitising, size limit, ownership, ATTACH_FILES, waveform + ranges, avatars                                                                |
| `apps/server/test/admin.test.ts`             |      11 | Admin/moderator access control, suspensions, last-admin protection, reports, reset links, settings, community removal, people in voice                                                                        |
| `apps/server/test/search-ops.test.ts`        |       8 | Search (prefix, accents, filters, FTS syntax inert, authorization), readiness, cleanup, restart persistence, backup → restore, corrupt archive refused                                                        |
| `apps/server/test/static.test.ts`            |       5 | SPA fallback, cache headers, JSON 404s, database/uploads/backups never served                                                                                                                                 |
| `apps/web/src/stores/messages.test.ts`       |      14 | 600-message window both ways, live appends, only live arrivals animate, outbox order and retries, single-update confirmation, uploads before sending                                                          |
| `apps/web/src/stores/session.test.ts`        |       3 | Sign-out: confirmed, already ended, server unreachable (stays signed in)                                                                                                                                      |
| `apps/web/src/styles/tokens.test.ts`         |      50 | WCAG contrast of every text, semantic, on-fill and icon token on translucent glass composited over the sky (worst case), both themes; selection, tiles                                                        |
| `apps/web/src/lib/markdown.test.tsx`         |       9 | No HTML injection, safe links, formatting, server-resolved mentions only, blank-line and code-block spacing, highlights, search snippets without markers                                                      |
| `apps/web/src/lib/sounds.test.ts`            |       5 | **New.** Silent before interaction, one sound per send, separate interface/notification switches and volumes, perceptual volume                                                                               |
| `apps/web/src/features/chat/motion.test.tsx` |       5 | **New.** History never animates; reaction pop, glints and count roll only for live changes; Calm/Reduce drop decorative effects                                                                               |
| `apps/web/src/lib/voice/sdp.test.ts`         |       4 | **New.** Opus payload detection; 320 kbit/s stereo CBR written into SDP without losing parameters; back to mono                                                                                               |
| `apps/web/src/lib/format.test.ts`            |       2 | **New.** Reused date formatters match `Intl`; day labels and relative times                                                                                                                                   |
| `apps/web/src/lib/cn.test.ts`                |       3 | Class merging keeps colours next to custom sizes                                                                                                                                                              |
| `apps/web/src/i18n/i18n.test.ts`             |       4 | Interpolation, plurals, dotted keys, missing keys                                                                                                                                                             |
| `apps/web/src/features/auth/helpers.test.ts` |       3 | Password strength meter, invite code parsing                                                                                                                                                                  |
| **Total**                                    | **242** | 24 files, all passed                                                                                                                                                                                          |

### Negative security tests (selection)

As in 0.1, these assert that something is **refused** (identical errors for unknown users and
wrong passwords, lockout, CSRF/origin checks, foreign WebSocket origins, connection caps,
non-members never receiving or reading anything, role hierarchy, admin-only endpoints, disguised
executables, inert FTS syntax, data directories never served). New in 0.2: people who cannot see
a channel cannot join its voice room (404) or receive its signals; a voice signal is never
relayed outside its room; a removed member's voice session ends at once; the TURN secret never
reaches a browser (only short-lived HMAC credentials); previews obey the original file's access
rules; uploads lose GPS/XMP/IPTC metadata.

## End-to-end tests (Playwright)

| Spec                     | Project |        Tests | Scenarios                                                                                                                                                                                                                                                                         |
| ------------------------ | ------- | -----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`           | desktop |            4 | Sign-up → onboarding → home; taken username explained inline; wrong password, then redirect to the requested page; sign-out                                                                                                                                                       |
| `communities.spec.ts`    | desktop |            3 | Create a community in the UI and invite a new person who joins via the link; join from Explore; private channels hidden from members                                                                                                                                              |
| `messaging.spec.ts`      | desktop |            4 | Two people: live messages, replies, mentions, reactions, edits, deletions; order after reload; leaving stops delivery; sign-out with unsent messages asks and deletes them                                                                                                        |
| `message-layout.spec.ts` | desktop |            2 | **New.** Consecutive messages grouped tightly and identical after reload; a message keeps its row and height from sending to confirmed (the spacing bug)                                                                                                                          |
| `dms-search.spec.ts`     | desktop |            3 | DM from a profile with a live reply; DM policy "nobody" respected; search never shows other communities                                                                                                                                                                           |
| `attachments.spec.ts`    | desktop |            2 | Audio waveform player; image viewer; outsiders get 404; **new:** an image can be sent while it uploads and others get a small preview                                                                                                                                             |
| `security.spec.ts`       | desktop |            6 | Private community isolation (pages, API, files); CSRF/origin; script in a message stays text; cookie flags; disguised executable; security headers                                                                                                                                |
| `settings-admin.spec.ts` | desktop |            7 | Profile edits; theme (Daylight/Twilight)/density/motion persist; sign out other devices; members kept out of admin; report → warn; invite-only registration; backup from dashboard                                                                                                |
| `sounds.spec.ts`         | desktop |            1 | **New.** Silent until the first interaction; one sound per send despite the server confirmation; a chime for others' messages; settings switch them off                                                                                                                           |
| `accessibility.spec.ts`  | desktop |            3 | Landmarks, one h1, skip link, labelled images and icon buttons; reduced motion; labelled fields and announced errors                                                                                                                                                              |
| `mobile.spec.ts`         | mobile  |            3 | Bottom navigation and back; long-press message actions; **new:** bottom bar, action sheet and dialogs clear an emulated 34 px home-indicator inset                                                                                                                                |
| `voice.spec.ts`          | voice   | 5 (1 opt-in) | **New.** Studio: Opus stereo at 319.9 kbit/s measured, left/right kept apart (FFT); Voice: mono, mute heard as silence, leaving releases the microphone; dropped server connection resumes the same call; refused microphone explained; TURN relay (opt-in, needs a local coturn) |
| **Total**                |         |       **43** | 42 passed, 1 skipped (TURN), 0 flaky                                                                                                                                                                                                                                              |

The TURN test was run separately against a local coturn 4.6.1 (`E2E_TURN=1`, see
[VOICE.md](VOICE.md#testing-turn)): passed, route "Relayed (TURN)", 317.8 / 319.9 kbit/s.

## Deployment verification

Performed with Docker 29.8 and Compose v5.6 using the real `docker-compose.yml`, `Dockerfile`,
`Caddyfile` and `deploy/*.sh` scripts (Caddy served plain HTTP on local port 8080 because no
public domain is available here). Full runbook: [RELEASE_0.2.md](RELEASE_0.2.md).

- Fresh install of the production version 0.1 (`956e6cf`) with `install.sh`; data created
  through Caddy: account, community, messages, a 0.57 MB photo, a WebSocket session.
- `update.sh <commit>` to 0.2: backup first, then fetch, build, restart, health check (36–53 s).
  Afterwards: messages, the photo (identical SHA-256) and the old session (REST + WebSocket)
  intact; preview generated for the old photo; files still require a session; voice announced;
  `Permissions-Policy: … microphone=(self) …` served.
- A real two-browser Studio call through the Docker image and Caddy: 319.3 / 320.8 kbit/s Opus
  stereo (getStats), measured values shown in the call bar, no console errors.
- Rollback: code-only (`git checkout` + kept image tag, healthy after 6 s) ran 0.1 on data written
  by 0.2; full restore of the pre-update backup returned the earlier state and moved newer data to
  `data/pre-restore-<time>/`. Rolling forward again worked.

Not verified: the real OVH VPS, Let's Encrypt issuance, voice between different real networks
(STUN/TURN on a public server).

## Manual and visual checks

- Every screen reviewed in both themes on desktop (1440×900) and phone (390×844) sizes: chat,
  lists, dialogs, community settings, admin, search with filters, image viewer, mobile drawer and
  sheets, public pages. Found and fixed: clipped focus rings in scrolling tab/chip rows, raw
  markdown in search snippets, ignored iPhone safe area (now tested).
- Frosted panes compared side by side with the earlier live blur (both themes): no visible
  difference.

## Not covered

- Firefox and Safari/WebKit (not available in this environment), real phones, screen readers.
- Voice across real networks and NATs, Bluetooth headsets, echo in Studio mode on speakers.
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
