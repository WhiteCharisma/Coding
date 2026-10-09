# Known limitations

Release 0.1 is a **tested deployment candidate**: it runs, it is covered by automated tests, and
its Docker deployment was exercised end to end on a local machine. It is **not yet a production
service**. This page lists what has not been verified, what is deliberately out of scope, and
the behaviour you should know about before inviting real users. Security-specific residual
risks are in [SECURITY.md](SECURITY.md#before-production).

## Not verified yet

| Area                       | Status                                                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real Hostinger VPS         | Not deployed. The same Compose stack, scripts and restore flow were tested locally with Docker 29.8 / Compose v5.6.                                                                                                                             |
| Let's Encrypt certificates | Not tested (no public DNS in the development environment). Caddy's automatic HTTPS is standard, but confirm it on the first deployment.                                                                                                         |
| Email delivery             | Tested with the development outbox only (emails written to disk). No real SMTP provider was used.                                                                                                                                               |
| Browsers                   | Automated tests ran in Chromium (desktop 1440×900 and a Pixel 7 emulation). Firefox, Safari/WebKit and real phones were not tested.                                                                                                             |
| Assistive technology       | Automated checks only (landmarks, headings, labels, focus, reduced motion, token contrast). No manual screen-reader pass (NVDA, VoiceOver, TalkBack). Role colours chosen by community admins are shown as picked and are not contrast-checked. |
| Load beyond the benchmark  | Measured up to 1 000 concurrent sockets and 20 000 messages on one machine ([PERFORMANCE.md](PERFORMANCE.md)); not over the public internet.                                                                                                    |
| Large uploads under load   | Size limits and streaming are tested; many concurrent large uploads were not benchmarked.                                                                                                                                                       |

## Architecture limits (by design for one small VPS)

- **One server, one Node.js process, one SQLite file.** No horizontal scaling or high
  availability. SQLite has a single writer; measured ≈300 message writes/s on a 4-core VM,
  far above what a community of a few hundred people produces.
- **Updates restart the app** (a few seconds of downtime). Open browsers reconnect by
  themselves and resend unsent messages from their outbox.
- **In-memory state resets on restart:** presence ("online"), typing indicators, per-IP rate-limit
  counters and temporary login lockouts.
- **Rate limits are per IP address and fixed in production** (for example 5 sign-ups per hour
  and 10 login attempts per minute per IP). People behind one shared address — carrier-grade NAT,
  a school or an event Wi-Fi — share these budgets. Changing them is a code change in
  `apps/server/src/auth/routes.ts`, not a setting.
- **Files live on the server's disk** (`data/uploads`), not in object storage. Disk size is the
  practical limit; the admin can lower the per-file limit (default 25 MB, hard limit 100 MB).
- **Up to 20 simultaneous connections per account** (tabs and devices); a 21st is refused.

## Features not in this release

- **Marketplace, credits and payments** — not implemented on purpose; design notes only
  ([ROADMAP.md](ROADMAP.md#marketplace-and-virtual-credits-not-implemented--design-notes)).
- **Push and email notifications** — notifications are in-app only (live while the app is open,
  and on the Notifications page). The only emails are account emails: address verification and
  password reset.
- **Data export** ("download my data") — not implemented. If you operate under GDPR or similar
  law, plan how you will answer access/portability requests (today: an administrator extracts
  the data manually from the database).
- **Threads, forwarding, scheduled messages, custom emoji, link previews, voice/video calls,
  screen sharing** — not implemented. Edited messages show an "edited" marker; earlier versions
  are not kept.
- **Media processing** — no server-side thumbnails or transcoding. Images are shown from the
  uploaded file, video plays only as uploaded MP4/WebM, and uploaded files are **not
  virus-scanned** (archives are allowed: ZIP).
- **Waveforms are computed by the uploader's browser** (96 peak values sent with the upload). The
  server checks their shape but cannot verify that they match the audio; they are display-only.
  If the uploader's browser cannot decode the format, a neutral placeholder waveform is shown.
- **Search** covers message text the searcher may read: whole words and word prefixes,
  accent-insensitive, up to 8 terms. No stemming, typo tolerance or search inside files. The
  `unicode61` tokenizer does not split Chinese or Japanese text into words, so search works
  poorly for those languages.
- **Group conversations** have at most 10 participants.
- **One interface language** (English). All strings are in `apps/web/src/i18n/en/*`, ready for
  translation, but no other language is included.
- **No installable app / offline mode.** The web app needs a connection; only the text of unsent
  messages is kept on the device (localStorage outbox) and sent when the connection returns.
  Files must finish uploading while online. A queued message whose files were uploaded more than
  an hour before it is finally sent is rejected (the cleanup job removes unattached uploads after
  one hour) and shown as failed; re-attach the files and send again.
- **Unsent messages and signing out.** Signing out deletes unsent messages from the device
  (after a confirmation). If the session ends on its own — it expired or was revoked from another
  device — unsent text stays in this browser's storage until the same person signs in again
  there. Signing out is not possible while the server is unreachable.

## Moderation and abuse handling

- Basic tools only: reports with a content snapshot, delete / warn / suspend, community kicks and
  bans, registration modes (open, invite-only, closed), an audit log.
- **No CAPTCHA, IP bans, automatic spam detection or word filters.** Mass registration is limited
  only by rate limits, invite-only mode and (when SMTP is configured) required email verification.
- A moderation team, community guidelines and an appeal contact have to be organised by the
  operator before opening registration.

## Data lifecycle

- **Backups are stored on the same server by default** and are not encrypted; copying them
  elsewhere is the operator's job ([OPERATIONS.md](OPERATIONS.md#backups)).
- **Deleted content persists in backups** until those archives rotate out (14 newest kept by
  default). Account deletion anonymises the profile and, if chosen, blanks the user's messages
  in the live database only.
- Audit log entries are kept indefinitely (they never contain message content).

## Encryption

HTTPS protects traffic between the browser and the server. Messages and files are stored
unencrypted on the server and are readable by whoever operates it — this is **not end-to-end
encryption**, and it should not be described as such.
