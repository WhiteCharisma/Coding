# Performance report

All numbers below were **measured**, not estimated, on 2026-10-09 with the scripts in
`scripts/bench/` against the production build. They describe this machine and these
conditions; a real VPS will differ (usually fewer CPU cores, but no load generator competing
for them). Re-run the benchmarks on the target server before relying on them for capacity
planning.

## Test conditions

| Item              | Value                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Machine           | Cloud VM, 4 × Intel Xeon @ 2.10 GHz, 15.7 GB RAM, Linux 6.18                                                                        |
| Server under test | `apps/server/dist` (production bundle), Node 22.22 with `--max-semi-space-size=16` (same flag as the Docker image)                  |
| Database          | SQLite (WAL) on local disk, fresh database per run                                                                                  |
| Load generator    | Same machine (Node 22 for HTTP/WebSocket load, Chromium 141 via Playwright 1.56 for the browser)                                    |
| Rate limits       | Relaxed (`NODE_ENV=test`, `RATE_LIMIT_MODE=relaxed`): all load comes from one IP, which production limits would throttle on purpose |
| Docker stack      | Page-load tests went through the real Compose stack (Caddy 2.11.7 with zstd/gzip → app on Node 24.21)                               |

Raw JSON results are written to `reports/raw/` (not committed). To reproduce:

```bash
npm run build
node scripts/bench/server-bench.mjs                  # ≈3 minutes
PAGE_URL=http://localhost:8080 node scripts/bench/client-bench.mjs   # Part A needs the Docker stack running
```

## Server

200 accounts in one community; 20 000 messages written first, then reads, then WebSocket fan-out.

| Operation (concurrency)                                    | Throughput | p50   | p95    | p99    |
| ---------------------------------------------------------- | ---------- | ----- | ------ | ------ |
| Sign-up — Argon2id 19 MiB / 2 passes (8)                   | 109 /s     | 70 ms | 92 ms  | 122 ms |
| Post a message over HTTP (16)                              | 300 /s     | 48 ms | 92 ms  | 119 ms |
| Latest 50 messages (10)                                    | 289 /s     | 29 ms | 64 ms  | 93 ms  |
| 50 messages deep in a 20 000-message channel (10)          | 299 /s     | 29 ms | 62 ms  | 74 ms  |
| Bootstrap (`/api/me/bootstrap`, 200-member community) (10) | 176 /s     | 47 ms | 104 ms | 140 ms |
| Full-text search over 20 000 messages (10)                 | 188 /s     | 45 ms | 96 ms  | 129 ms |
| Health check (10)                                          | 3 597 /s   | 2 ms  | 7 ms   | 11 ms  |

Latencies under concurrency are mostly queueing in the single Node process: at 300 writes/s
each request costs ≈3.3 ms of server time. Real-world traffic for a community of a few hundred
people is far below these rates.

### Real-time fan-out (WebSocket)

| Scenario                                               | Deliveries/s | Lost | Delivery latency p50 / p95 / p99 | Send ack p50 / p99 | Server CPU       |
| ------------------------------------------------------ | ------------ | ---- | -------------------------------- | ------------------ | ---------------- |
| 200 sockets (1 per user), 20 senders × 1 msg/s, 30 s   | 4 007        | 0    | 7.0 / 11.2 / 18.5 ms             | 9.2 / 20.9 ms      | 13 % of one core |
| 1 000 sockets (5 per user), 10 senders × 1 msg/s, 15 s | 10 000       | 0    | 18.5 / 33.6 / 38.9 ms            | 31.8 / 45.3 ms     | 17 % of one core |

Latency is measured end to end (sender's `message:send` → `message:new` received by every
socket), so it includes the load generator's own event loop handling 10 000 events/s.
Connection set-up: 260–450 connections/s, p50 52–92 ms (includes session validation).

### Memory and disk

| Measurement                                                          | Value                                      |
| -------------------------------------------------------------------- | ------------------------------------------ |
| Startup to ready                                                     | 1.07 s                                     |
| Idle RSS, production container (Node 24, `--max-semi-space-size=16`) | ≈130 MB (`docker stats`: ≈80 MiB)          |
| RSS after the full benchmark (20 000 writes, reads, 1 000 sockets)   | 265 MB (V8 keeps memory it has grown into) |
| Live heap, idle → 1 000 sockets                                      | 39 MB → 55 MB (≈16 KB per connection)      |
| Database size for 20 751 messages (incl. full-text index)            | 15.4 MB (≈740 bytes per message)           |
| Caddy, idle                                                          | ≈10 MB                                     |

Without the semi-space flag, V8 sized its young generation from the host's 16 GB and idled at
≈270 MB RSS; the Docker image sets the flag and the container has a 1 GB memory limit.

## Browser

### Page load (`/welcome`, first visit, cache disabled, through Caddy)

| Profile                                                                      | DOMContentLoaded | Largest Contentful Paint | Transferred                                 |
| ---------------------------------------------------------------------------- | ---------------- | ------------------------ | ------------------------------------------- |
| Desktop, no throttling                                                       | 134 ms           | 532 ms                   | 333 KB (JS 185 KB, fonts 128 KB, CSS 19 KB) |
| Mobile profile: 150 ms RTT, 1.6 Mbps down, 4× CPU slowdown (Lighthouse-like) | 1.38 s           | 2.21 s                   | 206 KB before fonts finished                |

JavaScript per public route (gzip): `/login` 149 KB, `/register` 150 KB, `/welcome` 173 KB
(includes the animation library). The signed-in app (chat, socket client, stores) is a separate
set of chunks. The final accessibility and sign-out fixes, made after these measurements, add
≈0.5 KB gzip to the public pages (compared chunk by chunk against the measured build).

**Before/after this round of optimisation** (same profile): LCP 3.47 s → 2.21 s, DCL 2.04 s →
1.38 s, JS 288 KB → 185 KB. Changes: the signed-in app is split from the public pages, Zod and
the validation schemas no longer ship to the browser, icons share one chunk, and the hero
heading no longer fades in from transparent (which delayed LCP).

### Signed-in start (navigate to a channel → first messages on screen, local server)

| Case                                                                        | Time    |
| --------------------------------------------------------------------------- | ------- |
| Returning user on this device (chunks preload while the session is checked) | 346 ms  |
| First visit on a device                                                     | 515 ms  |
| Before splitting the bundle (reference)                                     | ≈450 ms |

### Long channel (3 000 messages)

| Measurement                                             | Value                    |
| ------------------------------------------------------- | ------------------------ |
| Scroll back to the very first message                   | 59 pages, 9.8 s total    |
| Time per older page (fetch + render), p50 / p95         | 66 ms / 119 ms           |
| Messages kept rendered (window)                         | 600 maximum              |
| DOM nodes, maximum                                      | 4 474                    |
| JS heap at the end                                      | 68 MB                    |
| Main-thread long tasks during the whole run             | 227 ms total             |
| Scroll position shift when older messages are prepended | max 0.3 px over 15 pages |
| "Jump to present" from the beginning                    | 95 ms                    |
| Send: Enter → message visible (optimistic), p50 / p95   | 3.1 ms / 6.2 ms          |
| Send: Enter → confirmed by the server, p50 / p95        | 34 ms / 46 ms            |

**Before/after** for the same test: DOM nodes 15 232 → 4 474, long tasks 6.5 s → 0.2 s, page
p50 176 ms → 66 ms, heap growth ≈5 MB per page → stable. Changes: the rendered window is capped
in both directions with the reader's place anchored to the first visible message, and each
row's hover toolbar, touch action sheet and delete dialog are mounted only when first used.

## File transfers (release 0.2)

Measured on 2026-10-09 with `scripts/bench/transfer-bench.mjs` (curl, which streams files like a
browser) and `scripts/bench/media-bench.mjs` (Chromium, throttled), on the same 4-core VM. Test
files: a 20 KB JPEG, a 3.5 MB 4000×3000 photo-like JPEG, a 10.7 MB 2400×2400 PNG, a 20 MB ZIP and a
55 MB five-minute stereo WAV.

### Server and proxy: not the bottleneck

| File (median of 3) | Upload, direct | …via Caddy (Docker) | Server time¹ | Download, direct | Time to first byte |
| ------------------ | -------------- | ------------------- | ------------ | ---------------- | ------------------ |
| 3.5 MB photo       | 23–30 ms       | 36–45 ms            | 23 ms        | 16 ms            | 4–8 ms             |
| 10.7 MB PNG        | 73–80 ms       | 79–83 ms            | 74 ms        | 32–39 ms         | 5–8 ms             |
| 20 MB ZIP          | 85–107 ms      | 124 ms              | 77 ms        | 48–63 ms         | 4–9 ms             |
| 55 MB WAV          | 187–611 ms     | 672 ms              | 180 ms       | 181–196 ms       | 5–9 ms             |

¹ From the new `Server-Timing` header (receive + inspect + store), after the change.

Uploads run at 80–290 MB/s and downloads at 150–410 MB/s on loopback; server memory stays flat
during transfers (files are streamed to and from disk, never buffered whole). On a real VPS the
limit is the network — the users' upload bandwidth above all — not this code. Faster transfers
therefore come from sending and downloading less, and from not making people wait:

### What people experience (Chromium, 50 Mbit/s down, 10 Mbit/s up, 30 ms RTT)

| Measurement                                       | Before                         | After                   |
| ------------------------------------------------- | ------------------------------ | ----------------------- |
| Viewer: last of three images visible (cold cache) | 2.99 s                         | 1.18 s                  |
| Viewer: image bytes downloaded for those three    | 11.9 MB                        | 43 KB (WebP previews)   |
| Sender: message with a file visible               | 0.3 s / 1.2 s / 9.6 s / 51 s²  | 0.21–0.28 s (all files) |
| Sender: 55 MB WAV — time before the upload starts | 3.2 s (decoded first)          | 0.06–0.15 s             |
| Sender: chat usable while a file uploads          | No (send disabled)             | Yes                     |
| Sender: 3.5 MB photo — upload time                | 0.8 s (recompressed to 0.9 MB) | 3.1 s (original kept)³  |

² Small JPEG / photo / PNG / WAV: before, a message appeared only after its upload finished.
³ Deliberate: originals are no longer silently downscaled and recompressed. The sender does not
wait for it (the message shows at once with the local copy), and viewers get the small preview.

Changes: WebP previews (≤ 960 px) made by the server in a background queue; the browser starts
uploads immediately and computes audio waveforms in parallel; messages can be sent while their
files upload; retried uploads reuse the stored file (`X-Upload-Key`). Previews requested before
the background job finished wait for it (≈100–160 ms the first time).

## Interface (release 0.2)

The redesign adds glass, gloss, animations and sounds; these are its costs, measured against
0.1 on the **same machine on the same day** with the same scripts (0.1 = commit `956e6cf` built in
a separate worktree, deployed with Docker + Caddy for page loads). Headless Chromium here
rasterises in software (no GPU), which makes painting costs look larger than on most real
devices; low-end phones without GPU rasterisation behave similarly.

### Page load (`/welcome` through Caddy, cache disabled, median of 5)

| Profile                                 | 0.1                                | 0.2                                    |
| --------------------------------------- | ---------------------------------- | -------------------------------------- |
| Desktop: DOMContentLoaded / LCP         | 130 ms / 536 ms                    | 108 ms / 588 ms                        |
| Mobile (150 ms RTT, 1.6 Mbit/s, 4× CPU) | 1 419 ms / 2 372 ms                | 1 496 ms / 2 360 ms                    |
| Transferred                             | 334 KB (JS 186, CSS 19, fonts 128) | 251 KB (JS 193, CSS 28, fonts 28)      |
| Layout shift (CLS)                      | not measured                       | 0.021 (web font swap; "good" is < 0.1) |

### Long channel (`scripts/bench/client-bench.mjs`, 3 000 messages)

| Measurement                                      | 0.1             | 0.2              |
| ------------------------------------------------ | --------------- | ---------------- |
| Older page while scrolling back, p50 / p95       | 82 ms / 120 ms  | 69 ms / 93 ms    |
| Scroll back to the first message (59 pages)      | 10.2 s          | 9.4 s            |
| Main-thread long tasks during the whole run      | 585 ms          | 281 ms           |
| Scroll position shift when older messages load   | max 0.3 px      | max 0.4 px       |
| Send: Enter → message visible, p50 / p95         | 4.4 ms / 9.0 ms | 7.4 ms / 12.9 ms |
| Send: Enter → confirmed by the server, p50 / p95 | 36 ms / 59 ms   | 27 ms / 44 ms    |
| Open the channel → first messages on screen      | 471 ms          | 726 ms           |
| Rendered rows (window) / DOM nodes, maximum      | 600 / 4 473     | 600 / 4 507      |

**Found and fixed while measuring** (each change measured before/after; details in the commits):

| Problem                                                                                            | Fix                                                                                           | Effect                                                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| The large glass panes used a live `backdrop-filter`, redrawn whenever anything inside them changed | Panes show a pre-rendered frosted sky (fixed to the viewport) under their tint                | Older page p50 209 → 105 ms                           |
| That frosted sky was 12 CSS gradients, re-rasterised under every change                            | A 320×200 picture of it (1.4 KB), stretched (panes and picture since replaced: Vista desktop) | Channel open 934 → 787 ms (median of 3, 600 messages) |
| Every message created a new `Intl.DateTimeFormat`                                                  | Formatters reused per locale                                                                  | Older page p50 99 → 86 ms; channel open 787 → 749 ms  |
| The sky layer pulled the web font before any text existed, competing with the app's JavaScript     | The (text-less) sky layer uses a local font                                                   | Mobile DOMContentLoaded 1 599 → 1 501 ms              |
| The welcome page's code was requested only after the session check returned                        | Fetched in parallel with the check for signed-out visitors                                    | Mobile LCP 2 524 → 2 348 ms                           |
| Loading skeletons animated `background-position` (a repaint every frame)                           | Shimmer moves with `transform` only                                                           | No repaint per frame                                  |

**Still slower than 0.1:** opening a channel with long history (+≈0.25 s here, software
rendering: a larger component tree and more layers to paint per message), the optimistic send
(+3 ms, still well under one frame) and the desktop welcome LCP (+50 ms). Everything else is
equal or faster.

**Animations** use `transform`/`opacity` (composited) and run once per event; the only loops are
while something is pending (spinner, skeletons, typing dots). "Reduce motion" or the system
setting stops them all.
**Sounds** are synthesised on demand (no audio files to download).

## Vista desktop (release 0.2, Aero Glass redesign)

The Vista redesign (docs/DESIGN.md → Aero Glass) adds a glass window frame, a taskbar, gadgets and
an **animated wallpaper**. Measured against the 0.2 build just before it (`bfc7a72`) on the
same machine on the same day, headless Chromium with **software rendering** (no GPU: every
animated frame is composited by the processor, so animation costs look much larger than on a
computer with graphics acceleration). Medians of 3 runs.

### What the moving wallpaper costs (`idle` = nobody touches anything, channel open)

| State (1440 × 900)                                   | CPU used by the browser |
| ---------------------------------------------------- | ----------------------- |
| 0.2 (still sky)                                      | 0.4 % of one core       |
| Vista, wallpaper moving                              | 103 % of one core       |
| Vista, transparency off (no blur), wallpaper moving  | 105 % of one core       |
| Vista after a minute without input (wallpaper rests) | 2.1 % of one core       |
| Vista, window maximised (wallpaper covered, rests)   | 1.0 % of one core       |
| Vista, Calm motion (still wallpaper, clock ticks)    | 2.2 % of one core       |

Without graphics acceleration any animation means redrawing the whole screen for every frame,
whatever moves and however small (stopping all but one layer changed nothing; blur is not the
cost either). So the wallpaper only moves while someone can enjoy it: it rests while you scroll
or type, behind dialogs and a maximised window, while the browser is in the background and
after a minute without input; Calm and Reduce motion keep it still.

### Long channel (`scripts/bench/client-bench.mjs`, 3 000 messages, full motion)

| Measurement                                 | 0.2 before Vista | Vista             |
| ------------------------------------------- | ---------------- | ----------------- |
| Older page while scrolling back, p50 / p95  | 84 ms / 115 ms   | 91 ms / 141 ms    |
| Scroll back to the first message (59 pages) | 10.2 s           | 10.9 s            |
| Open the channel → first messages on screen | 711 ms           | 882 ms            |
| Jump back to the newest messages            | 131 ms           | 214 ms            |
| Send: Enter → message visible, p50 / p95    | 7.8 ms / 15.8 ms | 10.4 ms / 20.8 ms |
| Send: Enter → confirmed by the server, p50  | 30 ms            | 34 ms             |
| Main-thread long tasks during the whole run | 178 ms           | 392 ms            |
| DOM nodes (maximum) / JS heap at the end    | 4 507 / 63 MB    | 4 828 / 73 MB     |

**Found and fixed while measuring** (each measured before/after):

| Problem                                                                                                               | Fix                                                                                            | Effect                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A `:root:has(.modal-scrim)` rule (to pause the wallpaper behind dialogs) made every DOM change restyle the whole page | Open dialogs are counted in a store instead (`stores/desktop.ts`)                              | Elements restyled per sent message ≈ 1 170 → 57; style time for 15 sends 312 → 67 ms |
| The wallpaper's sky (12 CSS gradients) was repainted when the message list scrolled                                   | Three gradients (the wallpaper draws its own clouds) on a layer of their own                   | Opening a channel (600 messages, warm) 597 → ≈ 390 ms                                |
| The moving wallpaper made every frame of scrolling cost a full redraw                                                 | It holds still while you scroll (at once) or type (after 120 ms, not in the keystroke's frame) | Older page p50 202 → 91 ms                                                           |
| The taskbar re-rendered its notification area on every message, and its clock created two date formatters each time   | Notification area and community buttons memoised; cached formatters                            | The clock left the send profile (44 ms per 20 sends before)                          |
| The clock gadget's second hand swept with a transition, redrawing for 300 ms of every second                          | The hands jump once a second, like a quartz clock                                              | Calm, idle: 20 % → 2.2 % of a core                                                   |
| The wallpaper moved while nobody was looking                                                                          | Rests after a minute without input and under a maximised window                                | Idle 103 % → 2.1 % / 1.0 % of a core                                                 |

**Still slower than before Vista** (here, in software rendering): opening a long channel
(+0.17 s: more interface to build and more layers for the compositor to take over), jumping
back to the newest messages (+0.08 s), the optimistic send (+2.6 ms, well under one frame) and
more main-thread long tasks over a whole run (+0.2 s). The welcome page's LCP is 736 → 860 ms on
a desktop-sized window (local server, the animated desktop is painted with the page); the CSS
grew by 8.5 KB compressed (27.0 → 35.5 KB) and all JavaScript by 10.7 KB compressed.
**Not measured:** a computer with graphics acceleration and real phones (the wallpaper is not
shown on phones). If a computer without graphics acceleration feels busy, Settings →
Appearance → Motion → _Calm_ keeps the windows' effects and stills the wallpaper.

## Interpretation for a Hostinger VPS

- A KVM 1 (1 vCPU, 4 GB RAM) has ample headroom for a community of a few hundred people: the
  steady-state fan-out above used 13–17 % of one core while delivering 4 000–10 000 messages/s,
  and memory stays well under the container limit.
- Sign-ups are deliberately expensive (Argon2id); bursts of hundreds of sign-ups per minute
  would be CPU-bound, and the sign-up rate limit prevents that in production.
- The first bottleneck at much larger scale is the single Node process (fan-out CPU) and
  SQLite's single writer; see [ARCHITECTURE.md](ARCHITECTURE.md#scaling-envelope-and-upgrade-path).
- Not measured: behaviour on a real VPS, over the public internet, on real phones, with more
  than 1 000 concurrent sockets, or with large file uploads under load.
