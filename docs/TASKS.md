# Persistent task checklist

Status legend: `[x]` done and verified · `[~]` in progress / partial · `[ ]` not started.
Update this file in the same commit as the work it describes.

## Phase 0 — Repository and environment inspection
- [x] Inspect repository (empty, no commits) and environment (see "Environment" below)
- [x] Verify dependency versions and compatibility (see docs/ARCHITECTURE.md → Stack decisions)
- [x] Scaffold npm-workspace monorepo (apps/web, apps/server, packages/shared)
- [x] CLAUDE.md, docs/ARCHITECTURE.md, docs/SECURITY.md, docs/DEPLOYMENT.md, docs/ROADMAP.md
- [x] Database schema + initial migrations (incl. FTS5) validated in-memory

## Phase 1 — Visual design foundation
- [ ] Design tokens (dark + light), typography, icon system
- [ ] UI primitives (button, input, dialog, dropdown, tooltip, tabs, switch, toast, avatar…)
- [ ] Responsive application shell (rail, sidebar, main, context panel, mobile nav)
- [ ] Loading / empty / error states, motion conventions, i18n dictionary

## Phase 2 — Database and authentication
- [x] Registration, login, logout, sessions (hashed tokens, sliding expiry, revocation) — server + tests
- [x] Email verification + password reset (single-use, short-lived tokens) — server + tests
- [x] Profiles, preferences, blocks, account deletion (anonymisation) — server + tests
- [x] CLI: create-admin / promote / reset-link / backup / restore / seed-demo / purge-demo
- [x] Tests: apps/server/test/auth.test.ts (22 tests)
- [ ] UI for all of the above (frontend)

## Phase 3 — Communities and permissions
- [x] Communities, categories, channels, roles, overwrites, invites, bans, ownership transfer — server
- [x] Negative authorization tests: apps/server/test/communities.test.ts (19 tests)
- [ ] UI (community settings, roles, members, invites)

## Phase 4 — Real-time messaging
- [x] Socket.IO auth + origin check, room authorization sync
- [x] Idempotent send with ack, history pagination, edit/delete, replies, reactions, pins
- [x] Mentions, read states, unread counts, typing, presence, notifications
- [x] DMs / group DMs, blocks, DM privacy policy
- [~] Reconnection catch-up: server `after=` cursor done + tested; client outbox pending (frontend)
- [x] Multi-user integration tests: messaging (16), realtime (14), dms (5)

## Phase 5 — Creative user experience
- [x] Uploads (signature validation, authz download, ranges) — server + tests (uploads.test.ts, 9)
- [ ] Image/audio/video previews, waveform rendering (frontend)
- [x] Search (FTS5, authorization-filtered) — server + tests
- [x] Demo seed: generated artwork (PNG) + synthesized audio (WAV) + conversations
- [ ] Onboarding, home, explore, profiles, notifications UI, settings
- [ ] Demo content (generated artwork + audio, clearly marked)

## Phase 6 — Administration and operations
- [x] Reports, moderation actions, suspensions, audit logs — server + tests (admin.test.ts, 11)
- [ ] Admin dashboard UI
- [x] Health checks, logs, backups (SQLite online backup), restore — server + tests (search-ops.test.ts)
- [ ] Dockerfile, docker-compose.yml, Caddyfile, install/update/backup/restore scripts

## Phase 7 — Testing and optimization
- [ ] Typecheck, lint, build
- [ ] Unit + integration + negative security tests
- [ ] Playwright E2E (desktop + mobile, console errors, reduced motion)
- [ ] Docker persistence / backup / restore verification
- [ ] Performance measurements

## Phase 8 — Final delivery
- [ ] Test report, performance report, known limitations, Hostinger guide

## Environment (recorded 2026-10-09)
- Cloud dev container: Ubuntu 24.04, 4 vCPU, 15 GiB RAM, Node 22.22.0, npm 10.9.4.
- Docker 29.8 + Compose v5.6 available (daemon started manually with `dockerd`).
- Docker Hub anonymous pulls are rate limited (HTTP 429) in this environment; the official
  images were pulled from `mirror.gcr.io/library/*` and re-tagged locally for testing. On the
  production VPS, images come from Docker Hub as normal.
- Chromium for Playwright pre-installed at /opt/pw-browsers (revision 1194 → Playwright 1.56.1).
- No public DNS/ports: real Let's Encrypt certificate issuance cannot be tested here.
