# Voice rooms

Every text channel, direct message and group conversation has a **voice room**. Anyone who may
write in the conversation may join its room (headphones button in the header, or **Join voice**
above the messages). One voice session per account: joining elsewhere leaves the previous room.

## Architecture

```
 Browser A ── Socket.IO (signalling, authorised) ──► Server ◄── Socket.IO ── Browser B
     │                                                                      │
     └──────────── WebRTC audio, peer to peer (DTLS-SRTP, Opus) ───────────┘
                     (or through a TURN relay when no direct route exists)
```

| Layer      | Where                                        | What it does                                                                                      |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Signalling | `apps/server/src/realtime/voice.ts`          | Rooms in memory; who may join; relays SDP/ICE **only between members of the same room**           |
| Contract   | `packages/shared` (`types.ts`, `schemas.ts`) | `voice:join/leave/signal/state/rooms`, `voice:room/signal/ended`; Zod validation of every signal  |
| Media      | `apps/web/src/lib/voice/peer.ts`, `sdp.ts`   | One `RTCPeerConnection` per person (mesh), perfect negotiation, Opus tuning, ICE restart, stats   |
| Capture    | `apps/web/src/lib/voice/media.ts`            | Microphone constraints per mode, device list, level meter, speaking detection                     |
| State      | `apps/web/src/stores/voice.ts`               | Call state machine, mute/deafen, push-to-talk, sensitivity gate, devices, reconnection            |
| UI         | `apps/web/src/features/voice/`               | Header button, room strip, sidebar list, call bar with measured details, Settings → Voice & audio |

- **Authorisation** is the same rule as writing in the conversation
  (`requireChannelPermission(SEND_MESSAGES)`): people who cannot see the channel get "not found",
  read-only channels and blocked DMs are refused. Losing access (kicked, banned, role or channel
  permissions changed, account suspended) ends the voice session immediately (`voice:ended`).
- **Relay boundaries**: a signal is forwarded only if sender and recipient are in the same room;
  peer ids are random per session and cannot be taken over (resume requires the same account).
  Signals are size-limited and rate-limited (400 burst / 80 per second per connection); joins are
  limited to 6 burst / 1 every 2 s.
- **No media on the server.** Audio travels encrypted between the browsers (WebRTC DTLS-SRTP)
  and never passes through the app; a TURN relay forwards packets it cannot decrypt. The browsers
  exchange their key fingerprints through the server, so this is **not end-to-end encryption
  against the server's operator** (a compromised server could insert itself into new calls).
- **Mesh limit**: each person sends one stream per other person, so rooms are capped at
  `VOICE_MAX_PARTICIPANTS` (default 8). In Studio mode that is 7 × 320 kbit/s ≈ 2.2 Mbit/s upload
  per person in a full room. Larger rooms would need an SFU (a media server such as LiveKit or
  mediasoup) — new infrastructure, deliberately not introduced.
- **Reconnection**: media flows peer to peer, so a lost server connection does not stop the call.
  The session survives 20 s without a server connection; on reconnect the browser resumes the
  same session (same peer id, connections kept). A failed network path triggers an ICE restart.
- **Cleanup**: leaving, signing out, losing access or closing the tab stops every microphone
  track (the browser's "in use" indicator goes off) and closes all connections.

## Sound quality (measured)

| Mode                | Capture                                                | Opus (negotiated in SDP)                                                              |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Voice** (default) | echo cancellation, noise suppression, auto gain → mono | `stereo=0; maxaveragebitrate=64000; cbr=0; useinbandfec=1; usedtx=0`                  |
| **Studio**          | all processing off, `channelCount: 2`, 48 kHz          | `stereo=1; sprop-stereo=1; maxaveragebitrate=320000; cbr=1; useinbandfec=1; usedtx=0` |

Browsers read Opus settings from the **remote** description, so both sides write them into every
offer and answer (`tuneOpus`), and the sender's `RTCRtpSender` encoding is capped to the same
`maxBitrate`. The Connection details panel (call bar → activity icon) shows what `getStats()`
measures — bitrate sent and received, codec and channels, route (direct, STUN or TURN), round
trip and packet loss — never a configured label.

Verified by `e2e/voice.spec.ts` (two Chromium browsers, real WebRTC through the real server; the
fake microphone plays a stereo test tone, 440 Hz left / 1320 Hz right):

| Check (2026-10-09, Chromium, localhost)               | Result                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Studio, sent bitrate (getStats, 5 s, steady)          | **319.9 kbit/s** and 319.9 kbit/s (both directions), Opus, 2 channels                                  |
| Studio, stereo end to end (FFT of received audio)     | left peak 441 Hz, right peak 1319 Hz; the other tone 96–112 dB lower                                   |
| Voice, sent bitrate                                   | 64.7 kbit/s, `stereo=0`                                                                                |
| Mute                                                  | the other side receives silence (RMS < 0.002) and sees the muted mark                                  |
| Leave                                                 | every microphone track `ended`; the other side's room updates                                          |
| Server connection dropped mid-call                    | "Reconnecting…", then the same session resumes; no new peer connection; audio kept flowing             |
| TURN only (`iceTransportPolicy: relay`, coturn 4.6.1) | route "Relayed (TURN)", 317.8 / 319.9 kbit/s; coturn logs `ALLOCATE … success` for `<expiry>:<userId>` |

**Limitations, honestly:**

- Bitrate needs bandwidth: with less upload than 320 kbit/s per other person, WebRTC's congestion
  control lowers it (by design); the details panel then shows the real value. CBR is kept as long
  as the network allows.
- Congestion control ramps up over the first seconds of a call (the test waits for a steady
  state before measuring).
- Stereo needs Studio mode on **both** sides' capture (Voice mode's echo cancellation makes
  browsers capture mono). Studio mode has no echo cancellation: use headphones.
- Safari supports stereo Opus decoding but has historically ignored some capture constraints;
  it was not tested here (only Chromium). Firefox and Safari were not tested.
- Choosing the speaker (`setSinkId`) works in Chromium-based browsers and recent Firefox; Safari
  plays on the system default (the settings say so).

## Settings (per device, Settings → Voice & audio)

Sound quality (Voice / Studio), microphone, speaker, microphone test (level meter, optional
monitoring in headphones, releases the microphone when stopped), push to talk (any key; printable
keys are ignored while typing in a text field; a "Hold to talk" button in the call bar for touch
screens), input sensitivity (manual threshold in dB; the gate stays open 400 ms after you stop).

## STUN and TURN

Browsers behind NAT (most home connections) need **STUN** to find a public address, and strict
NATs/firewalls (≈ 10 %) need **TURN**, a relay. Nothing is configured by default — no third party
is contacted unless you choose so (`.env.example` lists the options):

1. **Your own coturn (recommended)** — `deploy/turn/docker-compose.turn.yml` + `turnserver.conf`.
   It is _not_ started by `install.sh`/`update.sh` and does not touch `data/` or `backups/`.
   It requires, on the VPS: firewall rules for 3478/udp, 3478/tcp and the relay range
   49160–49200/udp (5349/tcp only if you add TLS certificates for `turns:`), a DNS name, the
   public IPv4, and a shared secret in `.env` (`VOICE_TURN_SECRET`, used by both the app and
   coturn). The app hands each person **short-lived credentials** (coturn REST API: the username is
   `<expiry>:<userId>`, the password an HMAC-SHA1 of it with the secret; the secret never reaches
   browsers). The config refuses to relay into private and loopback networks, caps sessions and
   bandwidth. Bandwidth: a relayed Studio call costs the VPS 2 × 320 kbit/s per relayed stream.
2. **A public STUN server** (e.g. `stun:stun.l.google.com:19302`): free, but the provider sees
   users' IP addresses, and it does not help strict NATs.
3. **Nothing**: calls work on the same network or when one side is directly reachable.

### Testing TURN

```bash
sudo apt install coturn   # or the container above
turnserver -c deploy/turn/turnserver.conf --static-auth-secret=<secret> --realm=turn.local \
  --external-ip=127.0.0.1 --listening-ip=127.0.0.1 --relay-ip=127.0.0.1 --allow-loopback-peers
# (the shipped config refuses loopback peers; for a local test drop its 127.0.0.0 and ::1 lines)
E2E_TURN=1 VOICE_TURN_URLS=turn:127.0.0.1:3478 VOICE_TURN_SECRET=<secret> \
  npx playwright test --project=voice -g TURN
```

## Troubleshooting

| Symptom                                   | Cause and fix                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "Microphone access was refused"           | Allow the microphone for the site (address bar → site settings), then join again                   |
| "No microphone was found" / "in use"      | Plug one in, close the app using it, or pick another in Settings → Voice & audio                   |
| Joined, but nobody hears anybody          | No route between the browsers: configure STUN/TURN (above); the details panel shows no "Receiving" |
| Echo for the others                       | You are in Studio mode on speakers: use headphones, or switch to Voice                             |
| "Voice needs a secure (https) connection" | Browsers only allow microphones on https (or localhost)                                            |
