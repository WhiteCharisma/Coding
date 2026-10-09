# CLAUDE.md — Creator Network

Guidance for Claude Code (and any developer) working in this repository.

## Project purpose

Creator Network is an independent, self-hostable community platform for music producers,
musicians, labels, game developers, illustrators and other creative professionals:
real-time community messaging first, professional creator profiles second, and a future
(not yet built) marketplace for commissions. It must stay free to run: no paid APIs, no
external auth/analytics providers, one modest Linux VPS.

## Architecture overview (one page: docs/ARCHITECTURE.md)

- **Monorepo, npm workspaces**
  - `apps/web` — React 19 + TypeScript + Vite 8 + Tailwind CSS 4 single-page app.
  - `apps/server` — Fastify 5 REST API + Socket.IO 4 real-time gateway, one Node.js process.
  - `packages/shared` — Zod schemas, permission bitfields, API/event types, text helpers.
    Imported by both sides as TypeScript source. **Must never import server-only code** (fs,
    db, secrets). The web app must not import the Zod schemas (bundle size): use `LIMITS`,
    constants, types and `text.ts` helpers there.
- **Database**: SQLite (better-sqlite3, WAL) via Drizzle ORM. Migrations in
  `apps/server/drizzle/` run automatically at startup. Full-text search uses FTS5.
- **Files**: uploads stored under `DATA_DIR/uploads` with random names, served only through
  `GET /api/files/:id` after an authorization check.
- **Deployment**: Docker Compose — `app` (Node) + `caddy` (HTTPS reverse proxy). Data in
  `./data`, backups in `./backups` (bind mounts on the host).

## Commands

```bash
npm install                 # install all workspaces
npm run dev                 # server :3000 (tsx watch) + web :5173 (Vite, proxies /api and /socket.io)
npm run seed:demo           # load clearly-marked demo communities/users into the dev database
npm run cli -- create-admin # interactive: create the first administrator
npm run typecheck           # tsc --noEmit for every workspace
npm run lint                # ESLint (flat config)
npm test                    # Vitest: shared + server integration + web unit tests
npm run test:e2e            # Playwright end-to-end tests (builds + starts a server on :4173)
E2E_SKIP_BUILD=1 npx playwright test -g "pattern"   # reuse the last build, run matching tests
npm run build               # production build: apps/web/dist + apps/server/dist
node scripts/sky-frost.mjs                           # after changing the sky colours: re-render the panes' frost (needs a web build)
node scripts/bench/server-bench.mjs                  # server load benchmark (needs a build)
PAGE_URL=http://localhost:8080 node scripts/bench/client-bench.mjs   # browser benchmark
node scripts/sound-levels.mjs                        # loudness of the interface sounds (Chromium)
npm run db:generate         # after editing apps/server/src/db/schema.ts → new SQL migration
npm run check               # typecheck + lint + test + build
```

## Coding conventions

- TypeScript strict mode everywhere; no `any` unless justified in a comment.
- Validate every request body/query/socket payload with a Zod schema from `packages/shared`
  (`parse(schema, input)` in `apps/server/src/lib/validation.ts`).
- Business logic lives in `*/service.ts`; route handlers only parse input, call a service and
  shape the response. React components stay presentational; data logic lives in `stores/` and
  `lib/`.
- All UI strings go through the i18n dictionary (`apps/web/src/i18n/en/*.ts`) via `t()`.
- Styling uses design tokens (CSS variables in `apps/web/src/styles/tokens.css`, exposed to
  Tailwind in `app.css`; rules in `docs/DESIGN.md`). Do not introduce raw hex colors or
  arbitrary spacing in components. `tokens.test.ts` enforces text contrast: never use
  `text-fg-faint` for text, and run the tests after changing a token. When adding a custom
  Tailwind theme value (font size, shadow, easing), register it in `lib/cn.ts` too, or
  `tailwind-merge` may silently drop classes.
- Prefer CSS transitions; use Motion (`motion/react`) only for enter/exit and layout animations.
  Always respect `prefers-reduced-motion`.
- IDs are server-generated ULIDs (`newId()`), timestamps are epoch milliseconds.
- Keep dependencies minimal and pinned to exact versions.

## Security requirements (details: docs/SECURITY.md)

- Every protected action is authorized **on the server** (REST and socket events). Hiding a
  button is never security. Use `requireChannelPermission` / `requireCommunityPermission`.
- Never trust client-supplied channel/conversation/community IDs without a membership check.
- Return 404 (not 403) for resources the user cannot see, to avoid leaking existence.
- Sessions: random 256-bit token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 hash is
  stored. Never put tokens in localStorage. Passwords: Argon2id.
- State-changing API requests require the `X-Requested-With: CreatorNetwork` header and an
  allowed `Origin` (CSRF defense). Socket.IO checks `Origin` on handshake.
- Never log passwords, tokens, cookies or authorization headers (pino redaction is configured).
- Never commit `.env`, databases, uploads or backups. `.env.example` documents every variable.

## Deployment notes (details: docs/DEPLOYMENT.md)

- Target: a Linux VPS with Docker (e.g. Hostinger VPS "Ubuntu 24.04 with Docker"). Shared
  hosting is NOT supported (needs a persistent Node process and WebSockets).
- `deploy/install.sh` → first install, `deploy/update.sh` → update, `deploy/backup.sh` /
  `deploy/restore.sh` → backups, `deploy/create-admin.sh` → first administrator.
- Health: `GET /api/health` (liveness) and `GET /api/health/ready` (database, uploads, disk).
  Anonymous callers get only `{"status": …}`; details are in Admin → Overview.
- Never deploy automatically; deployments are run by the operator (`deploy/update.sh`).

## Current limitations

See `docs/KNOWN_LIMITATIONS.md` and `docs/TASKS.md`.

## Rules against destructive changes

- Never delete or overwrite `data/`, `backups/`, `.env` or a production database.
- Never edit an already-applied migration file; always add a new one with `npm run db:generate`.
- Never rewrite the whole project when a focused change is enough.
- Never disable a failing test to get green; fix the cause.
- Never weaken authorization checks, CSP, cookie flags or rate limits to make a feature work.
- Restores must move existing data aside (never delete it).

## Task checklist

`docs/TASKS.md` is the persistent checklist. When you finish or start a task, update it in
the same commit. If a session is interrupted, write the precise next steps there.
