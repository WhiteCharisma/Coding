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
- [x] Transfer performance: baseline measured (scripts/bench/transfer-bench.mjs, media-bench.mjs)
  - server + Caddy are not the bottleneck (80–230 MB/s locally, memory flat: streaming)
  - fixed: full-size images in chat → server WebP previews (sharp, background queue)
  - fixed: audio decoded before upload started → upload starts at once, waveform in parallel
  - fixed: silent recompression of photos → originals kept (downscaled only beyond limits)
  - fixed: sending blocked while uploading → message waits for its files, chat goes on
  - added: retry-safe uploads (X-Upload-Key), Server-Timing, GPS/XMP/IPTC removal (lossless)
  - verified: Docker image builds with sharp; previews work through Caddy; after-measurements
    in docs/PERFORMANCE.md (viewer 2.99 s → 1.18 s, 11.9 MB → 43 KB; sender sees files in ~0.25 s)
- [x] Aero design system (docs/DESIGN.md): sky scenes, glass panes, gloss, Daylight/Twilight
  - tokens rewritten; contrast test composites translucent glass over the sky (worst case)
  - Source Sans 3 (OFL) replaces Inter/Bricolage; original glossy logo; glossy primitives
  - shell: floating glass panes, bubble dock rail, glass mobile nav; presence orbs with rims;
    framed (rounded-square) display pictures with presence-coloured mounts on profiles
- [x] Redesign every screen on the new system
  - [x] chat: title-bar headers with orbs, glass day pills, glass hover toolbar, glossy reactions,
        glass composer with round send orb, photo frames, glossy audio play orb, file orbs
  - [x] lists: Windows-7-style selection (`aero-item`) for channels, DMs, settings, admin, menus;
        DM contact list with a filter field; member groups fold ("Online (3)")
  - [x] public pages: welcome "window" with original illustration, sign-in/up/recovery as glass
        windows over the sky (`SkyArt`), onboarding window, not-found
  - [x] home hero, Control-Panel-style section headings, glass tiles everywhere, glossy chips,
        luminous profile banners, notification rows
  - [x] fixes found on the way: role colours made readable on both themes (`role-name`); emoji
        picker now closes after a pick; a file that does not decode as an image gets no (broken)
        local preview
  - [x] final pass (desktop + phone, Daylight + Twilight): dialogs, community settings tabs,
        admin pages, search and its filters, image viewer, mobile drawer and bottom sheets.
        Fixed: keyboard focus rings clipped into stray bars inside scrolling tab/chip rows; raw
        markdown markers (`**`, backticks) in search snippets
- [x] Motion system and reaction animations (docs/DESIGN.md → Motion)
  - motion levels Full / Calm / Reduce motion (OS setting forces Reduce)
  - live-only message entrance, delete fade, edit flash, reaction pop + glints, count roll,
    badge pop, send flight, menus from their trigger, photo zoom into the viewer
  - fixed on the way: the list did not stay at the bottom when the last message grew
    (reactions, edits) or the composer grew; stray square focus glow inside the composer
- [x] Interface sounds with independent volume settings (docs/DESIGN.md → Sound)
  - original Web Audio synthesis (no files); 10 sounds; loudness equalised by measurement
    (scripts/sound-levels.mjs); interface vs notification channels with switch + volume
  - unlock after the first gesture; per-sound de-duplication; silent in Do not disturb
  - tests: engine unit tests (fake AudioContext) + e2e (no sound before interaction, one send
    sound despite the server confirmation, receive chime, switching sounds off)
- [x] WebRTC voice with verified audio quality (docs/VOICE.md)
  - voice rooms on every channel/DM (no schema change); server authorises (same rule as writing),
    relays signals only within a room, one session per account, ends sessions on lost access,
    20 s resume grace; STUN/TURN optional (short-lived HMAC credentials; opt-in coturn in deploy/turn)
  - client: mesh + perfect negotiation, Opus tuned in SDP per mode (Voice 64k mono / Studio 320k
    stereo CBR), sender caps, ICE restart, mute/deafen, PTT, sensitivity gate, devices + output
    selection, mic test, speaking rings, measured connection details, mic released on leave
  - measured in e2e (Chromium): 319.9 kbit/s Opus stereo, L/R separation ≥ 96 dB, voice 64.7k,
    mute = silence, resume without interrupting audio; via coturn 4.6.1: relayed at 319.9 kbit/s
  - not done: Firefox/Safari testing, SFU for large rooms, relay-only privacy mode
- [x] Responsive/a11y polish, docs, deployment and rollback notes
  - [x] call bar compacts on phones (label truncates; mode chip and settings link move to
        Settings); the header voice button gives way to the room strip on phones; error and
        offline screens as glass windows; Admin → Overview shows how many people are in voice
  - [x] safe areas: the iPhone home-indicator inset was ignored by dialog footers and the
        touch action sheet (the helper class lost against padding utilities) → explicit insets;
        e2e test emulates a 34 px inset (failed before the fix: 17 px)
  - [x] version 0.2.0 (Admin → Overview showed 0.1.0)
  - [x] upgrade test of a fresh 0.1 install (956e6cf) with the real `deploy/update.sh`: backup
        first, messages/photo/session kept, preview made for the old photo, voice config and
        `microphone=(self)` live; code rollback (kept image tag, 6 s) and full restore verified;
        Studio call through the Docker image + Caddy measured 318–323 kbit/s stereo
  - [x] runbook with OVH deployment, rollback, variables and the approval list (docs/RELEASE_0.2.md)
  - [x] final checks: typecheck, lint, Prettier, 242/242 unit+integration, e2e 42 passed + 1
        opt-in skipped, build, npm audit 0 (docs/TEST_REPORT.md)
- [x] Interface performance measured against 0.1 on the same machine (docs/PERFORMANCE.md)
  - fixed: live backdrop blur on the large panes (history scrolling twice as slow) → frosted sky
    picture fixed to the viewport; the sky layer fetching the web font early; welcome page code
    fetched after the session check; a new `Intl.DateTimeFormat` per message; skeleton shimmer
    repainting every frame
  - result: smaller first download (334 → 251 KB), mobile LCP equal (2.37 → 2.36 s), history
    scrolling faster (p50 82 → 69 ms), fewer long tasks (585 → 281 ms)
  - still slower: opening a channel with long history (+≈0.25 s in software rendering)

## Next steps (not done — require the owner's infrastructure or decisions)

1. Release 0.2 on the production server (OVH, `/opt/creator-network`): follow
   docs/RELEASE_0.2.md after approving the items listed there (deployment, microphone policy,
   voice on by default, STUN/TURN choice, firewall ports for coturn). Then confirm HTTPS,
   WebSockets and the security headers on the public domain, and a voice call between two
   different networks.
2. Configure SMTP; send a real verification and password-reset email.
3. Restore a backup on a second machine; schedule off-server backup copies.
4. Independent security review / penetration test (docs/SECURITY.md#before-production).
5. Manual accessibility pass with a screen reader; test Firefox, Safari and real phones.
6. Re-run `scripts/bench` on the VPS and record the results in docs/PERFORMANCE.md.
7. Product decisions: license, privacy policy and terms, community guidelines, moderators.
8. Next candidates (docs/ROADMAP.md): Web Push, data export, more languages; an SFU for voice
   rooms larger than 8; measure rendering on real phones (opening long channels).

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
