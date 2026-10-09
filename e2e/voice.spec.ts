import type { BrowserContext, Page } from '@playwright/test';
import { STEREO_TONE } from './env.mjs';
import { createCommunity, createInvite, expect, joinWithInvite, secondUser, signUp, test } from './fixtures';

/**
 * Real voice calls between two browser contexts (peer to peer WebRTC, through the real server's
 * signalling). Chromium's fake microphone plays a stereo tone: 440 Hz left, 1320 Hz right.
 * Everything below is MEASURED in the browsers (SDP, getStats(), decoded audio), not assumed.
 */

/** Test instrumentation: keep a handle on peer connections and microphone streams. */
async function instrument(context: BrowserContext, mode: 'voice' | 'studio', relayOnly = false) {
  await context.addInitScript(
    ({ m, relay }) => {
      localStorage.setItem('cn.voice', JSON.stringify({ mode: m }));
      const w = window as unknown as { __pcs: RTCPeerConnection[]; __mics: MediaStream[] };
      w.__pcs = [];
      w.__mics = [];
      const PC = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends PC {
        constructor(config?: RTCConfiguration) {
          // relay: as if every direct route were blocked (strict NAT / firewall).
          super(relay ? { ...config, iceTransportPolicy: 'relay' } : config);
          w.__pcs.push(this);
        }
      } as typeof RTCPeerConnection;
      const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => {
        const s = await gum(c);
        w.__mics.push(s);
        return s;
      };
    },
    { m: mode, relay: relayOnly },
  );
}

async function setUpPair(
  browser: import('@playwright/test').Browser,
  context: BrowserContext,
  page: Page,
  sink: string[],
  mode: 'voice' | 'studio',
  relayOnly = false,
) {
  await instrument(context, mode, relayOnly);
  await signUp(context, { displayName: 'Ada Lovelace' });
  const community = await createCommunity(context);
  const channel = community.channels[0];
  if (!channel) throw new Error('no channel');
  const code = await createInvite(context, community.id);
  const b = await secondUser(browser, sink);
  await instrument(b.context, mode, relayOnly);
  await signUp(b.context, { displayName: 'Bea Okafor' });
  await joinWithInvite(b.context, code);
  const url = `/c/${community.id}/${channel.id}`;
  await page.goto(url);
  await b.page.goto(url);
  await expect(page.getByTestId('composer-input')).toBeVisible();
  await expect(b.page.getByTestId('composer-input')).toBeVisible();
  return { b, url };
}

async function joinVoice(page: Page) {
  await page.getByTestId('voice-join').click();
  await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-status', 'connected');
}

/** Waits until the first peer connection is connected and audio bytes flow both ways. */
async function waitForMedia(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const pc = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.find(
            (p) => p.connectionState !== 'closed',
          );
          if (!pc || pc.connectionState !== 'connected') return 0;
          let received = 0;
          (await pc.getStats()).forEach((s) => {
            if (s.type === 'inbound-rtp' && s.kind === 'audio') received = s.bytesReceived;
          });
          return received;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(10_000);
}

/** Measures sent/received audio bitrate (bits/s) over a window, plus codec facts, from getStats(). */
function measure(page: Page, seconds: number) {
  return page.evaluate(async (secs) => {
    const pc = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.find(
      (p) => p.connectionState === 'connected',
    )!;
    const snap = async () => {
      const out = { sent: 0, received: 0, codec: '', channels: 0, fmtp: '', t: performance.now() };
      const report = await pc.getStats();
      const codecs = new Map<string, any>();
      report.forEach((s) => s.type === 'codec' && codecs.set(s.id, s));
      report.forEach((s) => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') {
          out.sent = s.bytesSent;
          const c = codecs.get(s.codecId);
          out.codec = c?.mimeType ?? '';
          out.channels = c?.channels ?? 0;
          out.fmtp = c?.sdpFmtpLine ?? '';
        }
        if (s.type === 'inbound-rtp' && s.kind === 'audio') out.received = s.bytesReceived;
      });
      return out;
    };
    const a = await snap();
    await new Promise((r) => setTimeout(r, secs * 1000));
    const b = await snap();
    const dt = (b.t - a.t) / 1000;
    return {
      sendBps: ((b.sent - a.sent) * 8) / dt,
      receiveBps: ((b.received - a.received) * 8) / dt,
      codec: b.codec,
      channels: b.channels,
      fmtp: b.fmtp,
      localSdp: pc.localDescription?.sdp ?? '',
      remoteSdp: pc.remoteDescription?.sdp ?? '',
    };
  }, seconds);
}

/**
 * Decodes what arrives from the other person and finds the loudest frequency on each channel
 * (Web Audio FFT of the received track): proves stereo survives end to end.
 */
function analyseReceivedAudio(page: Page) {
  return page.evaluate(async () => {
    const pc = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.find(
      (p) => p.connectionState === 'connected',
    )!;
    const track = pc.getReceivers().find((r) => r.track.kind === 'audio')!.track;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    const split = ctx.createChannelSplitter(2);
    src.connect(split);
    const analysers = [0, 1].map((ch) => {
      const a = ctx.createAnalyser();
      a.fftSize = 8192;
      a.smoothingTimeConstant = 0.5;
      split.connect(a, ch);
      return a;
    });
    await ctx.resume();
    await new Promise((r) => setTimeout(r, 1500));
    const result = analysers.map((a) => {
      const bins = new Float32Array(a.frequencyBinCount);
      a.getFloatFrequencyData(bins);
      let peak = 0;
      for (let i = 1; i < bins.length; i++) if (bins[i]! > bins[peak]!) peak = i;
      const hz = (peak * ctx.sampleRate) / a.fftSize;
      const at = (f: number) => bins[Math.round((f * a.fftSize) / ctx.sampleRate)]!;
      return { peakHz: hz, peakDb: bins[peak]!, db440: at(440), db1320: at(1320) };
    });
    // Overall level, to check muting.
    const level = await (async () => {
      const a = ctx.createAnalyser();
      src.connect(a);
      const buf = new Float32Array(a.fftSize);
      await new Promise((r) => setTimeout(r, 300));
      a.getFloatTimeDomainData(buf);
      return Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    })();
    await ctx.close();
    return { left: result[0]!, right: result[1]!, level };
  });
}

test.describe('voice rooms', () => {
  test('Studio mode: Opus stereo at 320 kbit/s, measured, with left and right kept apart', async ({
    browser,
    context,
    page,
    consoleErrors,
  }) => {
    test.setTimeout(90_000);
    const { b } = await setUpPair(browser, context, page, consoleErrors, 'studio');
    await joinVoice(page);
    await joinVoice(b.page);
    await expect(page.getByTestId('voice-room').getByText('Bea Okafor')).toBeVisible();
    // The sidebar lists each person in voice once, under the channel.
    await expect(page.getByRole('list', { name: 'In voice' }).getByText('Bea Okafor')).toHaveCount(1);
    await waitForMedia(page);
    await waitForMedia(b.page);

    // Congestion control ramps the encoder up over the first seconds: measure once it is steady.
    for (const p of [page, b.page]) {
      await expect
        .poll(async () => (await measure(p, 1)).sendBps, { timeout: 20_000, intervals: [0] })
        .toBeGreaterThan(300_000);
    }
    const ada = await measure(page, 5);
    const bea = await measure(b.page, 5);
    console.log(
      'studio measurements',
      JSON.stringify({
        ada: { ...ada, localSdp: undefined, remoteSdp: undefined },
        bea: { ...bea, localSdp: undefined, remoteSdp: undefined },
      }),
    );
    for (const m of [ada, bea]) {
      // Negotiated: both sides asked for stereo at 320 kbit/s, constant bitrate.
      expect(m.remoteSdp).toMatch(/a=fmtp:\d+ .*stereo=1/);
      expect(m.remoteSdp).toMatch(/a=fmtp:\d+ .*sprop-stereo=1/);
      expect(m.remoteSdp).toMatch(/a=fmtp:\d+ .*maxaveragebitrate=320000/);
      expect(m.remoteSdp).toMatch(/a=fmtp:\d+ .*cbr=1/);
      expect(m.codec).toBe('audio/opus');
      expect(m.channels).toBe(2);
      // Measured: what really goes over the wire (Opus payload bytes per second).
      expect(m.sendBps).toBeGreaterThan(280_000);
      expect(m.sendBps).toBeLessThan(345_000);
      expect(m.receiveBps).toBeGreaterThan(280_000);
    }

    // Stereo end to end: the left channel carries 440 Hz, the right 1320 Hz.
    const heard = await analyseReceivedAudio(b.page);
    console.log('studio stereo analysis', JSON.stringify(heard));
    expect(Math.abs(heard.left.peakHz - STEREO_TONE.left)).toBeLessThan(15);
    expect(Math.abs(heard.right.peakHz - STEREO_TONE.right)).toBeLessThan(15);
    expect(heard.left.db440 - heard.left.db1320).toBeGreaterThan(20); // the other tone is far below
    expect(heard.right.db1320 - heard.right.db440).toBeGreaterThan(20);

    // The connection details panel shows the measured numbers, not a label.
    await page.getByRole('button', { name: 'Connection details' }).click();
    const details = page.getByTestId('voice-details');
    await expect(details.locator('[data-stat="Sending"]')).toHaveText(/^\d+ kbit\/s$/, { timeout: 6000 });
    await expect(details.locator('[data-stat="Codec"]')).toHaveText('opus · stereo');
    await page.keyboard.press('Escape');

    await page.getByTestId('voice-leave').click();
    await b.page.getByTestId('voice-leave').click();
    await b.context.close();
  });

  test('Voice mode: mono speech settings; mute is heard as silence; leaving releases the microphone', async ({
    browser,
    context,
    page,
    consoleErrors,
  }) => {
    test.setTimeout(90_000);
    const { b } = await setUpPair(browser, context, page, consoleErrors, 'voice');
    await joinVoice(page);
    await joinVoice(b.page);
    await waitForMedia(page);
    await waitForMedia(b.page);

    const m = await measure(page, 4);
    console.log('voice measurements', JSON.stringify({ ...m, localSdp: undefined, remoteSdp: undefined }));
    expect(m.remoteSdp).toMatch(/a=fmtp:\d+ .*stereo=0/);
    expect(m.remoteSdp).toMatch(/a=fmtp:\d+ .*maxaveragebitrate=64000/);
    expect(m.sendBps).toBeLessThan(70_000);
    expect(m.sendBps).toBeGreaterThan(8_000);

    // Bea hears Ada; Ada mutes; Bea hears silence and sees the muted mark.
    expect((await analyseReceivedAudio(b.page)).level).toBeGreaterThan(0.01);
    await page.getByTestId('voice-mute').click();
    await expect(b.page.getByTestId('voice-room').getByLabel('Muted')).toBeVisible();
    await expect.poll(async () => (await analyseReceivedAudio(b.page)).level, { timeout: 10_000 }).toBeLessThan(0.002);

    // Leaving stops every microphone track (the browser's "in use" indicator goes off).
    await page.getByTestId('voice-leave').click();
    await expect(page.getByTestId('voice-dock')).toHaveCount(0);
    const live = await page.evaluate(
      () =>
        (window as unknown as { __mics: MediaStream[] }).__mics
          .flatMap((s) => s.getTracks())
          .filter((t) => t.readyState !== 'ended').length,
    );
    expect(live).toBe(0);
    await expect(b.page.getByTestId('voice-room').getByText('Ada Lovelace')).toHaveCount(0);
    await b.page.getByTestId('voice-leave').click();
    await b.context.close();
  });

  test('a dropped server connection resumes the same call; the audio keeps flowing meanwhile', async ({
    browser,
    context,
    page,
    consoleErrors,
  }) => {
    test.setTimeout(90_000);
    // Route Ada's WebSocket through the test so the server connection can be cut.
    let current: import('@playwright/test').WebSocketRoute | null = null;
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => ws.send(m));
      current = ws;
    });
    const { b } = await setUpPair(browser, context, page, consoleErrors, 'voice');
    await joinVoice(page);
    await joinVoice(b.page);
    await waitForMedia(b.page);
    const received = () =>
      b.page.evaluate(async () => {
        const pc = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.find(
          (p) => p.connectionState === 'connected',
        );
        let bytes = 0;
        (await pc?.getStats())?.forEach((s) => {
          if (s.type === 'inbound-rtp' && s.kind === 'audio') bytes = s.bytesReceived;
        });
        return bytes;
      });
    const pcCount = await page.evaluate(() => (window as unknown as { __pcs: unknown[] }).__pcs.length);

    const before = await received();
    await current!.close(); // the server connection drops
    await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-status', 'reconnecting');
    await expect(page.getByTestId('voice-dock')).toHaveAttribute('data-status', 'connected', { timeout: 20_000 });
    // Same session (no new peer connection was needed) and the audio never stopped.
    expect(await page.evaluate(() => (window as unknown as { __pcs: unknown[] }).__pcs.length)).toBe(pcCount);
    // Over the outage plus two more seconds at ~64 kbit/s (8 kB/s), well over 10 kB must arrive.
    await page.waitForTimeout(2000);
    expect((await received()) - before).toBeGreaterThan(10_000);
    await expect(b.page.getByTestId('voice-room').getByText('Ada Lovelace')).toBeVisible();
    await page.getByTestId('voice-leave').click();
    await b.page.getByTestId('voice-leave').click();
    await b.context.close();
  });

  // Needs a TURN server: run coturn locally (docs/VOICE.md → "Testing TURN") and start the
  // tests with E2E_TURN=1 VOICE_TURN_URLS=turn:127.0.0.1:3478 VOICE_TURN_SECRET=<its secret>.
  test('connects through the TURN relay when direct routes are blocked', async ({
    browser,
    context,
    page,
    consoleErrors,
  }) => {
    test.skip(!process.env.E2E_TURN, 'set E2E_TURN=1 with a local TURN server to run this test');
    test.setTimeout(90_000);
    const { b } = await setUpPair(browser, context, page, consoleErrors, 'studio', true);
    await joinVoice(page);
    await joinVoice(b.page);
    await waitForMedia(page);
    await waitForMedia(b.page);
    await page.getByRole('button', { name: 'Connection details' }).click();
    await expect(page.getByTestId('voice-details').locator('[data-stat="Route"]')).toHaveText('Relayed (TURN)', {
      timeout: 8000,
    });
    const m = await measure(page, 3);
    console.log('turn measurements', JSON.stringify({ ...m, localSdp: undefined, remoteSdp: undefined }));
    expect(m.receiveBps).toBeGreaterThan(200_000);
    await page.keyboard.press('Escape');
    await page.getByTestId('voice-leave').click();
    await b.page.getByTestId('voice-leave').click();
    await b.context.close();
  });

  test('a refused microphone is explained, and nothing is left open', async ({ context, page }) => {
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await signUp(context);
    const community = await createCommunity(context);
    await page.goto(`/c/${community.id}/${community.channels[0]!.id}`);
    await page.getByTestId('voice-join').click();
    await expect(page.getByText(/Microphone access was refused/)).toBeVisible();
    await expect(page.getByTestId('voice-dock')).toHaveCount(0);
  });
});
