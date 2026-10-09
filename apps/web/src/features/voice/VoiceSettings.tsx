import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t, type TKey } from '../../i18n';
import {
  canChooseOutput,
  LevelMeter,
  MicError,
  openMicrophone,
  stopStream,
  toDb,
  type VoiceMode,
} from '../../lib/voice/media';
import { useVoice } from '../../stores/voice';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/input';
import { Segmented } from '../../components/ui/segmented';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { SectionHeader, SettingsCard } from '../settings/parts';
import { InputLevel } from './VoiceParts';

/** Microphone test: a live level meter and, optionally, your own voice in your headphones. */
function MicTest() {
  const settings = useVoice((s) => s.settings);
  const inCall = useVoice((s) => s.status !== 'idle');
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [monitor, setMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const out = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!running) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let meter: LevelMeter | null = null;
    let timer = 0;
    let cancelled = false;
    void (async () => {
      try {
        stream = await openMicrophone(settings.mode, settings.inputId);
        if (cancelled) return stopStream(stream);
        void useVoice.getState().refreshDevices(); // device names are readable now
        ctx = new AudioContext();
        meter = new LevelMeter(ctx, stream);
        timer = window.setInterval(() => setLevel(Math.min(1, (meter?.read() ?? 0) * 4)), 100);
        const el = new Audio();
        el.srcObject = stream;
        el.muted = true;
        if (settings.outputId && canChooseOutput()) await el.setSinkId(settings.outputId).catch(() => undefined);
        void el.play().catch(() => undefined);
        out.current = el;
      } catch (err) {
        setError(t(`voice.errors.${err instanceof MicError ? err.code : 'failed'}` as TKey));
        setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      meter?.dispose();
      void ctx?.close().catch(() => undefined);
      if (out.current) {
        out.current.pause();
        out.current.srcObject = null;
        out.current = null;
      }
      stopStream(stream); // releases the microphone
      setLevel(0);
    };
  }, [running, settings.mode, settings.inputId, settings.outputId]);

  useEffect(() => {
    if (out.current) out.current.muted = !monitor;
  }, [monitor, running]);

  const db = toDb(level / 4);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={running ? 'secondary' : 'primary'}
          size="sm"
          disabled={inCall}
          onClick={() => {
            setError(null);
            setRunning((r) => !r);
          }}
          data-testid="mic-test"
        >
          {running ? <Square /> : <Mic />} {running ? t('voice.prefs.testStop') : t('voice.prefs.testStart')}
        </Button>
        {inCall ? (
          <InputLevel className="w-48" />
        ) : (
          <span
            role="meter"
            aria-label={t('voice.prefs.level')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
            className="relative block h-2 w-48 overflow-hidden rounded-full border border-line bg-inset"
          >
            <span
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[var(--presence-online)] transition-transform duration-100"
              style={{ transform: `scaleX(${Math.max(0.01, level)})` }}
            />
            {settings.gate && (
              <span
                aria-hidden
                className="absolute inset-y-0 w-0.5 bg-danger"
                // Same scale as the bar: linear level × 4, threshold converted from dB.
                style={{ left: `${Math.min(100, 10 ** (settings.gateDb / 20) * 4 * 100)}%` }}
              />
            )}
          </span>
        )}
        {running && <span className="font-mono text-xs text-fg-muted tabular-nums">{Math.round(db)} dB</span>}
      </div>
      <p className="text-xs text-fg-muted">{t('voice.prefs.testHint')}</p>
      {running && (
        <Switch label={t('voice.prefs.hearYourself')} checked={monitor} onCheckedChange={setMonitor} className="py-0" />
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function KeyBinder() {
  const key = useVoice((s) => s.settings.pttKey);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') void useVoice.getState().setSettings({ pttKey: e.code });
      setListening(false);
    };
    window.addEventListener('keydown', onKey, { capture: true, once: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [listening]);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-fg-2">{t('voice.prefs.pttKey')}</span>
      <kbd className="rounded-md border border-line bg-inset px-2 py-0.5 font-mono text-xs text-fg">
        {listening ? t('voice.prefs.pttPress') : key.replace(/^Key|^Digit/, '')}
      </kbd>
      <Button size="sm" onClick={() => setListening(true)} disabled={listening}>
        {t('voice.prefs.pttSet')}
      </Button>
    </div>
  );
}

export function VoiceSection() {
  const settings = useVoice((s) => s.settings);
  const devices = useVoice((s) => s.devices);
  const set = (patch: Parameters<ReturnType<typeof useVoice.getState>['setSettings']>[0]) =>
    void useVoice.getState().setSettings(patch);
  useEffect(() => {
    void useVoice.getState().refreshDevices();
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title={t('voice.prefs.title')} subtitle={t('voice.prefs.subtitle')} />
      <SettingsCard title={t('voice.prefs.mode')}>
        <Segmented<VoiceMode>
          label={t('voice.prefs.mode')}
          value={settings.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'voice', label: t('voice.prefs.modeVoice') },
            { value: 'studio', label: t('voice.prefs.modeStudio') },
          ]}
        />
        <p className="mt-3 text-sm text-fg-muted">
          {settings.mode === 'studio' ? t('voice.prefs.modeStudioHint') : t('voice.prefs.modeVoiceHint')}
        </p>
      </SettingsCard>
      <SettingsCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg-2">{t('voice.prefs.input')}</span>
            <Select value={settings.inputId ?? ''} onChange={(e) => set({ inputId: e.target.value || null })}>
              <option value="">{t('voice.prefs.systemDefault')}</option>
              {devices.inputs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg-2">{t('voice.prefs.output')}</span>
            {canChooseOutput() ? (
              <Select value={settings.outputId ?? ''} onChange={(e) => set({ outputId: e.target.value || null })}>
                <option value="">{t('voice.prefs.systemDefault')}</option>
                {devices.outputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm text-fg-muted">{t('voice.prefs.outputUnsupported')}</span>
            )}
          </label>
        </div>
        <p className="mt-3 text-xs text-fg-muted">{t('voice.prefs.devicesHint')}</p>
      </SettingsCard>
      <SettingsCard title={t('voice.prefs.test')}>
        <MicTest />
      </SettingsCard>
      <SettingsCard>
        <Switch
          className="py-0"
          label={t('voice.prefs.ptt')}
          description={t('voice.prefs.pttHint')}
          checked={settings.ptt}
          onCheckedChange={(ptt) => set({ ptt })}
        />
        {settings.ptt && (
          <div className="mt-3">
            <KeyBinder />
          </div>
        )}
      </SettingsCard>
      <SettingsCard>
        <Switch
          className="py-0"
          label={t('voice.prefs.gate')}
          description={t('voice.prefs.gateHint')}
          checked={settings.gate}
          onCheckedChange={(gate) => set({ gate })}
        />
        {settings.gate && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm text-fg-2">{t('voice.prefs.threshold')}</span>
            <Slider
              label={t('voice.prefs.threshold')}
              valueText={`${settings.gateDb} dB`}
              value={settings.gateDb}
              min={-80}
              max={-20}
              onValueChange={(gateDb) => set({ gateDb })}
              className="max-w-xs"
            />
            <span className="w-14 shrink-0 text-right font-mono text-xs text-fg-muted tabular-nums">
              {settings.gateDb} dB
            </span>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
