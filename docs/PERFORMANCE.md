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
