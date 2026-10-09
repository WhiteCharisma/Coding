# Persistent task checklist

Status legend: `[x]` done and verified · `[~]` partial · `[ ]` not started.
Update this file in the same commit as the work it describes.

## Phase 0 — Repository and environment inspection

- [x] Inspect repository (empty, no commits) and environment (see "Environment" below)
- [x] Verify dependency versions and compatibility (docs/ARCHITECTURE.md → Stack decisions)
- [x] Scaffold npm-workspace monorepo (apps/web, apps/server, packages/shared)
- [x] CLAUDE.md and initial docs
- [x] Database schema + migrations (incl. FTS5)

## Phase 1 — Visual design foundation

- [x] Design tokens (dark + light), typography, icons — docs/DESIGN.md
- [x] UI primitives (button, input, dialog/sheet, menu, popover, tooltip, tabs, switch, toast, …)
- [x] Responsive shell (rail, sidebar, main, context panel, phone navigation and drawers)
- [x] Loading / empty / error states, motion conventions, reduced motion, i18n dictionary
- [x] Contrast of every text token enforced by `apps/web/src/styles/tokens.test.ts`

## Phase 2 — Database and authentication

- [x] Registration, sign-in, sessions (hashed tokens, sliding expiry, revocation)
- [x] Email verification + password reset (single-use, short-lived tokens); admin reset links
- [x] Profiles, preferences, blocks, account deletion (anonymisation)
- [x] CLI: create-admin / promote / reset-link / backup / restore / seed-demo / purge-demo
- [x] UI: welcome, sign-in, registration, recovery, verification, invites, onboarding, settings

## Phase 3 — Communities and permissions

- [x] Communities, categories, channels, roles, overwrites, invites, bans, ownership transfer
- [x] Negative authorization tests (server and browser)
- [x] UI: create/join, community settings, roles, members, invites, channel editor

## Phase 4 — Real-time messaging

- [x] Socket.IO auth + origin check, room authorization sync, per-account connection cap
- [x] Idempotent send with ack, history pagination, edit/delete, replies, reactions, pins
- [x] Mentions, read states, unread counts, typing, presence, notifications
- [x] DMs / group DMs, blocks, DM privacy policy
- [x] Client outbox (localStorage, ordered, same-nonce retries), reconnect catch-up
- [x] Explicit sign-out asks before deleting unsent messages; offline sign-out fails visibly

## Phase 5 — Creative user experience

- [x] Uploads (signature validation, authorised download, byte ranges)
- [x] Image lightbox, audio waveform player, video, file cards
- [x] Search (FTS5, authorization-filtered), Explore, profiles, notifications, home
- [x] Demo content: generated artwork + synthesized audio, labelled "Demo", removable

## Phase 6 — Administration and operations

- [x] Reports, moderation actions, suspensions, audit log, instance settings, registration codes
- [x] Admin dashboard (overview, reports, users, communities, invites, settings, backups, audit)
- [x] Health checks, JSON logs with redaction, scheduled cleanup and backups
- [x] Dockerfile, docker-compose.yml, Caddyfile, install/update/backup/restore/create-admin/reset-link

## Phase 7 — Testing and optimization

- [x] Typecheck, lint, format, production build
- [x] Unit + integration + negative security tests (Vitest)
- [x] Playwright E2E (desktop + phone, console-error check, reduced motion, security boundaries)
- [x] Docker verification: install, persistence across re-creation, backup → restore, updates
- [x] Performance measurements and optimisations (docs/PERFORMANCE.md)

## Phase 8 — Final delivery

- [x] README, test report, performance report, known limitations, design doc, third-party notices
- [x] Security review notes and "Before production" checklist (docs/SECURITY.md)
- [x] Hostinger guide (docs/DEPLOYMENT.md) and operations guide (docs/OPERATIONS.md)

## Release 0.2 — Frutiger Aero upgrade (branch `feature/frutiger-aero-premium-upgrade`)

- [x] Message spacing: root causes found and fixed, regression tests (unit + E2E)
  - hover timestamp in grouped rows wrapped ("03:24 PM" in a 40px gutter) → +25px per row
  - newline after a code block rendered as an empty line (pre-wrap); blank-line runs uncapped
  - unsent messages used a different layout and un-normalised text → jump on confirmation
- [~] Transfer performance: baseline measured (scripts/bench/transfer-bench.mjs, media-bench.mjs)
  - server + Caddy are not the bottleneck (80–230 MB/s locally, memory flat: streaming)
  - fixed: full-size images in chat → server WebP previews (sharp, background queue)
  - fixed: audio decoded before upload started → upload starts at once, waveform in parallel
  - fixed: silent recompression of photos → originals kept (downscaled only beyond limits)
  - fixed: sending blocked while uploading → message waits for its files, chat goes on
  - added: retry-safe uploads (X-Upload-Key), Server-Timing, GPS/XMP/IPTC removal (lossless)
  - todo: Docker image check with sharp, after-measurements, PERFORMANCE.md
- [ ] Aero design system and full-screen redesign
- [ ] Motion system and reaction animations
- [ ] Interface sounds with independent volume settings
- [ ] WebRTC voice with verified audio quality
- [ ] Responsive/a11y polish, docs, deployment and rollback notes

## Next steps (not done — require the owner's infrastructure or decisions)

1. Deploy to the real Hostinger VPS (docs/DEPLOYMENT.md) and confirm Let's Encrypt issuance,
   HTTPS redirect, WebSockets through Caddy and the security headers on the public domain.
2. Configure SMTP; send a real verification and password-reset email.
3. Restore a backup on a second machine; schedule off-server backup copies.
4. Independent security review / penetration test (docs/SECURITY.md#before-production).
5. Manual accessibility pass with a screen reader; test Firefox, Safari and real phones.
6. Re-run `scripts/bench` on the VPS and record the results in docs/PERFORMANCE.md.
7. Product decisions: license, privacy policy and terms, community guidelines, moderators.
8. Release 0.2 candidates (docs/ROADMAP.md): Web Push, data export, thumbnails, more languages.

## Environment (recorded 2026-10-09)

- Cloud dev container: Ubuntu 24.04, 4 vCPU, 15 GiB RAM, Node 22.22.0, npm 10.9.4.
- Docker 29.8 + Compose v5.6 available (daemon started manually with `dockerd`).
- Docker Hub anonymous pulls are rate limited (HTTP 429) in this environment; the official
  images were pulled from `mirror.gcr.io/library/*` and re-tagged locally for testing. On the
  production VPS, images come from Docker Hub as normal.
- Outbound HTTPS goes through an intercepting proxy here; the Docker build accepts its CA via
  the optional `build_ca` BuildKit secret (never stored in the image).
- Chromium for Playwright pre-installed at /opt/pw-browsers (Playwright 1.56.1); Firefox and
  WebKit are not available, so cross-browser testing was not possible.
- No public DNS/ports: real Let's Encrypt certificate issuance cannot be tested here.
