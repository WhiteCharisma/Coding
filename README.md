# Creator Network

An independent, self-hosted community platform for music producers, musicians, labels, artists,
game developers and designers: real-time community chat with channels, roles and direct
messages, audio-first attachments, creator profiles, moderation and administration — running on
one modest Linux server with no paid services.

> **Status: tested deployment candidate (release 0.1), not yet a production service.** The
> application, its automated tests and its Docker deployment (install, update, backup, restore)
> have been run and verified on a development machine. It has not yet been deployed to a real
> VPS with a public domain. Read [Known limitations](docs/KNOWN_LIMITATIONS.md) and
> [Before production](docs/SECURITY.md#before-production) before inviting real users.

## What it does

- **Accounts:** registration (open, invite-only or closed), sign-in, email verification and
  password recovery (with SMTP), one-time reset links from admins (without SMTP), device/session
  management, account deletion, onboarding.
- **Communities:** public or private, categories, text and announcement channels, private
  channels, roles with a permission hierarchy and per-channel overrides, invite links, kicks,
  bans, ownership transfer.
- **Messaging:** real time over WebSockets, replies, mentions, reactions, edits, deletions, pins,
  unread markers, typing and presence, direct messages and group conversations, messages queued
  while offline and sent once the connection returns — never duplicated.
- **Files:** images, audio (waveform player with seeking), video, PDF, ZIP and text; type checked
  by content; every download authorised.
- **Discovery:** full-text search limited to what you may read, Explore for public communities,
  creator profiles with disciplines and links, notifications.
- **Moderation and admin:** reports with content snapshots, warnings, suspensions, audit log,
  instance settings, registration codes, health and resource overview, backups.
- **Design:** dark-first "studio" theme with one amber accent, light theme, compact density,
  reduced-motion support, keyboard and screen-reader basics, phone layout.

Not included: marketplace and virtual credits (design notes only, see [Roadmap](docs/ROADMAP.md)),
push/email notifications, end-to-end encryption. HTTPS protects traffic in transit; it is not
end-to-end encryption.

## Run it locally

Requirements: Node.js 22.12 or newer (24 recommended, see `.nvmrc`) and npm. Developed and
tested on Linux.

```bash
npm install
npm run cli -- create-admin      # interactive: your first administrator (no default accounts exist)
npm run seed:demo                # optional: demo communities, people, artwork and audio (labelled "Demo")
npm run dev                      # API on :3000 + web app on :5173
```

Open http://localhost:5173. Data is stored in `./data` (database and uploads) and backups in
`./backups`; both are git-ignored.

Production build on your machine:

```bash
npm run build
APP_ORIGIN=http://localhost:3000 npm start     # serves the app and API on http://localhost:3000
```

## Tests and checks

```bash
npm run typecheck     # TypeScript, all workspaces + E2E sources
npm run lint          # ESLint
npm test              # Vitest: shared, server integration and web unit tests
npm run test:e2e      # Playwright: builds, starts a throw-away server on :4173, desktop + phone
npm run check         # typecheck + lint + test + build
```

Latest results: [docs/TEST_REPORT.md](docs/TEST_REPORT.md). Benchmarks:
[docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Deploy

A Linux VPS with Docker (for example a Hostinger VPS with the "Ubuntu 24.04 with Docker"
template), a domain pointing at it, ports 80 and 443 open:

```bash
git clone <this repository> /opt/creator-network && cd /opt/creator-network
./deploy/install.sh          # asks for the domain, writes .env, builds and starts (HTTPS via Caddy)
./deploy/create-admin.sh     # first administrator
```

Step-by-step guide, including which Hostinger products work and which do not:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Day-to-day operations (updates, backups, restores,
logs): [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Documentation

| Document                                          | Contents                                                   |
| ------------------------------------------------- | ---------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)           | Components, data model decisions, real-time design, layout |
| [DESIGN.md](docs/DESIGN.md)                       | Visual identity, tokens, motion, accessibility rules       |
| [SECURITY.md](docs/SECURITY.md)                   | Threat model, safeguards, residual risks, pre-launch steps |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)               | Hostinger VPS / Docker installation guide                  |
| [OPERATIONS.md](docs/OPERATIONS.md)               | Updates, backups, restores, health, troubleshooting        |
| [TEST_REPORT.md](docs/TEST_REPORT.md)             | What is tested and the latest results                      |
| [PERFORMANCE.md](docs/PERFORMANCE.md)             | Measured load and page-speed results                       |
| [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | What is not verified, not built, or limited by design      |
| [ROADMAP.md](docs/ROADMAP.md)                     | Next releases, marketplace design notes                    |
| [TASKS.md](docs/TASKS.md)                         | Persistent implementation checklist                        |
| [CLAUDE.md](CLAUDE.md)                            | Conventions and rules for contributors and AI assistants   |

## License

No license has been chosen for this project yet (`"license": "UNLICENSED"` in `package.json`):
all rights are reserved by the owner. Third-party software and its licenses:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
