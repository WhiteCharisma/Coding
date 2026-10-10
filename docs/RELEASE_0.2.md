# Release 0.2 — Frutiger Aero upgrade

Branch `feature/frutiger-aero-premium-upgrade`, version **0.2.0**. This page is the runbook for
putting it on the production server (OVH VPS, Ubuntu 24.04, Docker Compose, `/opt/creator-network`)
and for taking it back off. Nothing here has been run on the production server: deploying is
the owner's decision (see [What needs your approval](#what-needs-your-approval)).

## What changes for people

- **New look**: Windows Vista–style Aero Glass inside the chat ([DESIGN.md](DESIGN.md#aero-glass-windows-vista)).
  On computers and tablets every part of the app — channel list, conversation, members — is a
  glass pane with a glowing glass header and frame, the message box sits on glass at the foot of
  the conversation, and a smoky-glass rail with a glossy orb holds the navigation (resting on a
  community shows what is new there); behind it all moves an animated Frutiger Aero wallpaper.
  Settings → Appearance → **Window colour**: twelve glass colours, the colour intensity and
  _Enable transparency_. Phones keep a full-screen layout. _Daylight_ and _Twilight_ themes;
  every screen was redesigned.
- **Chat spacing fixed**: no more large gaps between messages (root causes and tests in
  [TASKS.md](TASKS.md#release-02--frutiger-aero-upgrade-branch-featurefrutiger-aero-premium-upgrade)).
- **Animations**: the rail and the panes rise into place when the app opens; a light sweeps
  across a pane's glass when it shows a new place; the members pane slides in; rail buttons glow
  in their community's colour and flash orange on a mention; dialogs open as glass windows and
  toasts pop up as balloons; the wallpaper moves while you are there (it holds still while you
  scroll or type, behind dialogs and after a minute without input). New messages, reactions
  (pop + glints), sending, editing, deleting, menus and photo zoom. Settings → Appearance →
  Motion: _Full motion_, _Calm_ (still wallpaper, no decorative effects) or _Reduce motion_; the
  operating system's "reduce motion" always wins.
- **Sounds**: ten original interface sounds (synthesised in the browser, no audio files).
  Interface and notification sounds have separate switches and volumes (Settings →
  Notifications); silent until the first click or key press, and in Do not disturb.
- **Voice rooms** in every channel and conversation: real WebRTC calls with mute, deafen,
  push to talk, input sensitivity, microphone/speaker choice and a microphone test. _Studio_
  mode sends stereo Opus at 320 kbit/s (measured, [VOICE.md](VOICE.md)).
- **Faster files**: images in chat load as small previews (originals untouched), uploads start
  immediately, sending no longer waits for uploads ([PERFORMANCE.md](PERFORMANCE.md#file-transfers-release-02)).
- Phones: content stays clear of the iPhone home indicator; the call bar fits small screens.

## What does not change

| Area                                                    | In 0.2                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Database                                                | **No migration.** Same schema as 0.1; 0.1 can run again on data written by 0.2 (tested)                                       |
| `data/`, `backups/`, `.env`                             | Untouched by the update. No new required variable; the new `VOICE_*` variables have safe defaults                             |
| `docker-compose.yml`, `deploy/Caddyfile`, `deploy/*.sh` | Unchanged (new, optional, separate: `deploy/turn/` for a TURN relay — not started by any script)                              |
| Sessions                                                | Kept: people stay signed in                                                                                                   |
| Uploaded files                                          | Kept byte for byte; chat previews of older images are made on first view and stored next to the original (`*.preview.webp`)   |
| HTTP headers                                            | One change: `Permissions-Policy` now allows the microphone **for the site itself** (`microphone=(self)`, was `microphone=()`) |
| Docker image                                            | Adds `sharp` (image previews); the image is about 515 MB                                                                      |

## Rehearsal (done on a copy, not on production)

A fresh install of the current production commit `956e6cf` (0.1) was created with the real
`deploy/install.sh` (Docker 29.8, Compose v5.6, Caddy on a local port), filled with data through
Caddy (account, community, messages, a 0.57 MB photo, a WebSocket session) and upgraded with the
real `deploy/update.sh`:

- the script took a backup first, fetched, checked out the new version, built, restarted and
  waited for the health check (36–53 s on a 4-vCPU machine; the site stays up while it builds);
- afterwards: the messages, the photo (identical SHA-256) and the old session cookie (REST and
  WebSocket) all still worked; a preview was made for the old photo; files still require a
  session (401 without); `/api/config` announced voice; the new `Permissions-Policy` was served;
- a **Studio call between two browsers through the Docker image and Caddy** measured
  318–323 kbit/s Opus stereo in each direction over four runs (getStats; final build: 320.6 /
  323.2 kbit/s), with the measured values shown in the call bar;
- **code rollback** (commands below; healthy 6 s after the command with the kept image tag)
  brought 0.1 back on the same data, including messages written by 0.2; **full rollback**
  (`restore.sh` with the pre-update backup) returned the exact earlier state and moved the newer
  data to `data/pre-restore-<time>/` (nothing deleted);
- rolling forward again with `update.sh` worked the same way. Every step of the runbook below was
  run as written, in this order, on the copy.
- **after the Vista redesign**, the same copy (then on the earlier 0.2 build `8802d02`) was updated
  with `./deploy/update.sh 86ed846`: backup first (0.58 MB), image rebuilt, healthy after 17 s.
  Messages, the photo (identical SHA-256), its preview, the old session (REST and WebSocket), the
  voice configuration and the `Permissions-Policy` were all unchanged; files still answer 401
  without a session; the Vista desktop loaded through Caddy with that session and no browser
  error. Later commits change documentation only.

Speed compared with 0.1 on the same machine: [PERFORMANCE.md](PERFORMANCE.md#interface-release-02)
(smaller first download, faster scrolling through history; opening a long channel ≈0.25 s
slower in headless software rendering). The Vista desktop came after this rehearsal; its costs
are measured in [PERFORMANCE.md](PERFORMANCE.md#vista-desktop-release-02-aero-glass-redesign)
(scrolling and sending close to the earlier 0.2; opening a long channel +0.17 s; the moving
wallpaper uses about one processor core on computers **without** graphics acceleration while
someone is there, and rests otherwise).

## Deploying to the OVH VPS

Read it once fully before starting. Commands run on the VPS as the user that owns
`/opt/creator-network` (the same one that ran `install.sh`, usually root or with `sudo`).

### 1. Check the starting point

```bash
cd /opt/creator-network
git status --short --untracked-files=no   # must print nothing (update.sh refuses otherwise)
git rev-parse --short HEAD                # write this down: the version to roll back to
git branch --show-current                 # the branch you deploy from
df -h . /var/lib/docker                   # keep ≥ 2 GB free (new image + one backup)
docker compose ps                         # app "healthy", caddy "running"
```

### 2. Make the safety copies

```bash
./deploy/backup.sh                                      # archive in ./backups
docker tag creator-network:latest creator-network:pre-0.2   # keeps the running image for a 1-minute rollback
```

Copy the newest archive **off the server** before going on (from your own computer):

```bash
rsync -av root@YOUR_VPS:/opt/creator-network/backups/ ./creator-network-backups/
```

### 3. Update

Pick one way of getting the code:

- **A — recommended:** after reviewing, merge `feature/frutiger-aero-premium-upgrade` into the
  branch the server tracks (for this repository: `claude/optimistic-heisenberg-dphowv`), then:

  ```bash
  ./deploy/update.sh
  ```

- **B — without merging:** deploy the exact commit you reviewed (the script fetches first):

  ```bash
  ./deploy/update.sh <commit-sha>      # e.g. the branch tip named in the release report
  ```

  This leaves the checkout on a detached commit; later, `./deploy/update.sh` without an
  argument stops with "not currently on a branch" (after its backup, before changing anything).
  Return to normal with `git checkout <your branch> && ./deploy/update.sh` once the release is
  merged.

The script takes another backup, builds the new image **while the old version keeps serving**
(a few minutes on a small VPS: dependencies changed), then restarts the app (a few seconds of
downtime; browsers reconnect and send queued messages) and waits up to 3 minutes for the health
check. Caddy and its certificates are not touched.

If the build fails, nothing was changed: the old version is still running. If the new version
does not become healthy, the script prints rollback commands — use the faster ones below.

### 4. Check it

```bash
curl -fsS https://YOUR_DOMAIN/api/health/ready      # {"status":"ok"}
docker compose ps                                    # app "healthy"
docker compose logs app --since 10m | grep -E '"level":(50|60)'    # should print nothing (errors)
ls -lt backups | head -3                             # the pre-update archive is there
```

In the browser (reload once — the app's files changed):

- Admin → Overview: version **0.2.0**, "All systems operational", the same user and message counts.
- An existing channel: old messages and images are there (an old image's preview is made on its
  first view); you are still signed in.
- Voice: join a channel's voice room from two devices; the call bar's activity icon shows
  measured bitrates. **Across different networks, calls need STUN/TURN** (next section) —
  without it they connect only when both are on the same network or one side has a public IP.

### 5. Optional: make voice work across all networks

Nothing is configured by default, so no third party is contacted. Two choices, both
changes to the server's configuration that need your decision ([VOICE.md](VOICE.md#stun-and-turn)):

1. **Your own coturn (recommended)** — `deploy/turn/docker-compose.turn.yml`. Needs a DNS name
   (e.g. `turn.example.com` → the VPS IPv4), firewall rules for **3478/udp, 3478/tcp and
   49160–49200/udp**, and in `.env`:

   ```bash
   VOICE_STUN_URLS=stun:turn.example.com:3478
   VOICE_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
   VOICE_TURN_SECRET=<openssl rand -hex 32>     # shared by the app and coturn, never sent to browsers
   TURN_REALM=turn.example.com
   TURN_EXTERNAL_IP=<public IPv4 of the VPS>
   ```

   then `docker compose -f deploy/turn/docker-compose.turn.yml --env-file .env up -d` and
   `docker compose up -d` (re-creates the app with the new settings; no rebuild). A relayed
   Studio call costs the VPS about 2 × 320 kbit/s per relayed stream.

2. **A public STUN server only** (`VOICE_STUN_URLS=stun:stun.l.google.com:19302`): free, no
   ports to open, but the provider sees users' IP addresses, and strict networks (≈ 1 in 10)
   still cannot connect.

To keep voice switched off for now: `VOICE_ENABLED=false` in `.env`, then `docker compose up -d`.

## Rolling back

| Situation                                      | Do this                                                                                                                                                                                                          | Data                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0.2 misbehaves, data is fine (normal case)     | `git checkout <noted sha>` then `docker tag creator-network:pre-0.2 creator-network:latest && docker compose up -d --no-build` (≈ 1 minute; without the tag: `docker compose build app && docker compose up -d`) | Everything kept, including what was written on 0.2 (same schema). Users reload the page once                           |
| Data damaged by the new version (not expected) | `./deploy/restore.sh backups/<archive from the update>.tar.gz`                                                                                                                                                   | Back to the moment of the backup; later messages/uploads/accounts are moved to `data/pre-restore-<time>/`, not deleted |

After a code rollback, previews made by 0.2 stay as small unused files next to their originals;
they are harmless (0.1 ignores them).

**Never**, at any point: `docker compose down -v` (deletes the certificate volumes), deleting or
moving `data/` or `backups/`, editing or committing `.env`, or replacing `deploy/Caddyfile` for a
test.

## Environment variables (all optional)

| Variable                         | Default  | Meaning                                                             |
| -------------------------------- | -------- | ------------------------------------------------------------------- |
| `VOICE_ENABLED`                  | `true`   | Voice rooms on/off                                                  |
| `VOICE_MAX_PARTICIPANTS`         | `8`      | People per room (mesh: each sends one stream per other person)      |
| `VOICE_MAX_BITRATE`              | `320000` | Highest Opus bitrate in bit/s; lower it to cap Studio mode          |
| `VOICE_STUN_URLS`                | empty    | Comma-separated `stun:` URLs                                        |
| `VOICE_TURN_URLS`                | empty    | Comma-separated `turn:`/`turns:` URLs; requires `VOICE_TURN_SECRET` |
| `VOICE_TURN_SECRET`              | empty    | Shared secret (≥ 16 characters) for short-lived TURN credentials    |
| `VOICE_TURN_TTL_HOURS`           | `12`     | Validity of those credentials                                       |
| `TURN_REALM`, `TURN_EXTERNAL_IP` | —        | Only for the optional coturn container                              |

## What needs your approval

Nothing below has been done on the production server.

1. **Deploying 0.2** to `/opt/creator-network` (steps above) — and, for way A, merging the branch
   into the production branch.
2. **Microphone permission policy**: the site may ask for the microphone (`microphone=(self)`);
   no other site embedded in it can.
3. **Voice rooms on by default** (`VOICE_ENABLED=true`): anyone who may write in a channel may
   join its voice room. Set `false` if you prefer to roll this out later.
4. **Choosing STUN/TURN** (none is configured): a public STUN provider (sees users' IPs) or your
   own coturn.
5. **For coturn**: opening 3478/udp, 3478/tcp and 49160–49200/udp on the VPS firewall (and in
   the OVH network firewall if you use it), a DNS record, a secret in `.env`, and the extra
   bandwidth for relayed calls.
6. **Any restore** (`restore.sh`): it takes the service back to the backup's moment.

No database migration, no change to `.env`, `docker-compose.yml` or the Caddy configuration is
required by this release.
