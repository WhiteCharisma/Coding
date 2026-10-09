# Roadmap

## Release 0.1 — reliable community messaging

Communities, channels, roles/permissions, invitations, real-time messaging (DMs, group DMs,
replies, reactions, mentions, pins, read states, typing, presence), attachments with audio
previews, search, notifications, creator profiles, moderation and administration, Docker
deployment with backups.

## Release 0.2 — Frutiger Aero upgrade (this branch)

Frutiger Aero redesign of every screen (Daylight/Twilight), animations with Full/Calm/Reduce
motion, original interface sounds with their own volume controls, WebRTC voice rooms (Studio
mode: 320 kbit/s stereo Opus, measured), image previews and faster uploads (server-side WebP
previews with sharp/libvips in a background queue), chat spacing fixes. See
[RELEASE_0.2.md](RELEASE_0.2.md).

## Next (0.3) — quality and reach

- Web Push notifications (service worker + VAPID keys, self-hosted, no paid service).
- Threads on messages; message forwarding; scheduled announcements.
- Voice: an SFU (media server) for rooms larger than 8, screen sharing, Firefox/Safari testing.
- Full emoji search and custom community emoji.
- Additional languages (the UI already uses a central dictionary in `apps/web/src/i18n`).
- Link previews through a sandboxed fetcher (SSRF-safe allowlist).
- Optional ClamAV scanning for archives.

## Later (0.4+) — professional network

- Portfolio sections (tracks, artwork galleries, game credits) on profiles.
- Discovery by discipline / availability ("open for collaboration").
- Collaboration boards (project posts with roles wanted).

## Marketplace and virtual credits (not implemented — design notes)

The marketplace must stay **separate from messaging** (`apps/server/src/marketplace/*`, its own
tables with a `mk_` prefix) so messaging never depends on it.

Planned entities: `mk_listings` (commission/service offers), `mk_requests`, `mk_orders`
(state machine: requested → accepted → in_progress → delivered → completed / disputed /
refunded), `mk_deliverables` (files via the existing upload pipeline), `mk_disputes`,
`mk_ledger_entries`, `mk_accounts`.

Rules for any future credit/balance system:

1. Balances are **derived from an append-only double-entry ledger** (`mk_ledger_entries`), never
   stored as a mutable number the client can influence. A cached balance column may exist only if
   it is updated in the same transaction as the ledger entries.
2. Every money-moving operation carries an **idempotency key** (unique index) so retries cannot
   double-charge or double-pay.
3. Balance changes happen in a **single database transaction** with row-level checks
   (no negative balances unless explicitly allowed).
4. The client never computes or submits balances or prices; the server is authoritative.
5. Platform fees are explicit ledger entries.
6. Card data is never stored — a payment provider (e.g. Stripe Connect, Mollie, PayPal) holds it.

Before enabling real money: review payment-provider availability in the owner's country,
KYC/AML obligations for payouts, consumer-protection and refund law, chargeback handling,
tax/VAT on platform fees, fraud prevention, and whether redeemable credits count as e-money or
stored value in the relevant jurisdictions. **SQLite is not appropriate for the ledger at scale;
migrate to PostgreSQL first.**

## End-to-end encryption

Not planned for the first releases. It conflicts with server-side search and moderation and
needs a separately specified, independently audited design (key management, device
verification, recovery).
