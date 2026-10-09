import { LIMITS, type Discipline, type ProfileLink, type SelfUser } from '@creator-network/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage, fieldError } from '../../lib/api';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import { toast } from '../../components/ui/toast';
import { AvatarUploader } from '../../components/user/AvatarUploader';
import { DisciplinePicker } from '../../components/user/DisciplinePicker';
import { UserAvatar } from '../../components/user/UserAvatar';
import { bannerStyle } from '../profile/useProfile';
import { SectionHeader, SettingsCard } from './parts';

interface ProfileForm {
  displayName: string;
  headline: string;
  bio: string;
  disciplines: Discipline[];
  location: string;
  timezone: string;
  currentProjects: string;
  links: ProfileLink[];
  bannerHue: number | null;
}

function fromUser(u: SelfUser): ProfileForm {
  return {
    displayName: u.displayName,
    headline: u.headline,
    bio: u.bio,
    disciplines: u.disciplines,
    location: u.location,
    timezone: u.timezone,
    currentProjects: u.currentProjects,
    links: u.links,
    bannerHue: u.bannerHue,
  };
}

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

export function ProfileSection({ user }: { user: SelfUser }) {
  const [form, setForm] = useState<ProfileForm>(() => fromUser(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const zones = useMemo(() => timeZones(), []);
  const dirty = JSON.stringify(form) !== JSON.stringify(fromUser(user));
  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const links = form.links.filter((l) => l.label.trim() || l.url.trim());
      const res = await api.patch<{ user: SelfUser }>('/api/me/profile', { ...form, links });
      useSession.getState().setUser(res.user);
      setForm(fromUser(res.user));
      toast.success(t('settings.profile.saved'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const linkError = (i: number) => fieldError(error, `links.${i}.url`) ?? fieldError(error, `links.${i}.label`);
  const known = new Set(['displayName', 'headline', 'bio', 'location', 'timezone', 'currentProjects']);
  const generalError = error !== null && ![...known].some((k) => fieldError(error, k)) && !form.links.some((_, i) => linkError(i)) ? errorMessage(error) : null;

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <SectionHeader title={t('settings.profile.title')} subtitle={t('settings.profile.subtitle')} />

      <SettingsCard className="overflow-hidden p-0 sm:p-0">
        <div className="h-24" style={bannerStyle(form.bannerHue)} />
        <div className="-mt-8 flex items-end gap-3 px-4 pb-4">
          <UserAvatar name={form.displayName || user.displayName} src={user.avatarUrl} size="xl" className="rounded-full ring-4 ring-sidebar" />
          <div className="min-w-0 pb-1">
            <p className="truncate font-semibold text-fg">{form.displayName || user.displayName}</p>
            <p className="truncate text-sm text-fg-muted">{form.headline || `@${user.username}`}</p>
          </div>
          <Link to={`/u/${user.username}`} className="ml-auto pb-1 text-sm text-accent-text hover:underline">
            {t('settings.profile.preview')}
          </Link>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.profile.avatar')}>
        <AvatarUploader hint={t('onboarding.profile.avatarHint')} />
        <div className="mt-5 flex flex-col gap-2">
          <label htmlFor="banner-hue" className="text-sm font-medium text-fg-2">
            {t('settings.profile.bannerColor')}
          </label>
          <div className="flex items-center gap-3">
            <input
              id="banner-hue"
              type="range"
              min={0}
              max={360}
              value={form.bannerHue ?? 40}
              onChange={(e) => set('bannerHue', Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full accent-[var(--accent)]"
              style={{ background: 'linear-gradient(90deg, oklch(0.6 0.13 0), oklch(0.6 0.13 60), oklch(0.6 0.13 120), oklch(0.6 0.13 180), oklch(0.6 0.13 240), oklch(0.6 0.13 300), oklch(0.6 0.13 360))' }}
            />
            {form.bannerHue !== null && (
              <Button size="sm" variant="ghost" onClick={() => set('bannerHue', null)}>
                {t('common.actions.clear')}
              </Button>
            )}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="flex flex-col gap-4">
          <Field label={t('settings.profile.displayName')} error={fieldError(error, 'displayName')}>
            {(p) => <Input {...p} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} maxLength={LIMITS.displayNameMax} required />}
          </Field>
          <Field label={t('settings.profile.headline')} error={fieldError(error, 'headline')}>
            {(p) => <Input {...p} value={form.headline} onChange={(e) => set('headline', e.target.value)} maxLength={LIMITS.headlineMax} placeholder={t('settings.profile.headlinePlaceholder')} />}
          </Field>
          <Field label={t('settings.profile.bio')} error={fieldError(error, 'bio')} hint={`${form.bio.length}/${LIMITS.bioMax}`}>
            {(p) => <Textarea {...p} value={form.bio} onChange={(e) => set('bio', e.target.value)} maxLength={LIMITS.bioMax} rows={4} />}
          </Field>
          <Field label={t('settings.profile.projects')} error={fieldError(error, 'currentProjects')}>
            {(p) => <Textarea {...p} value={form.currentProjects} onChange={(e) => set('currentProjects', e.target.value)} maxLength={LIMITS.projectsMax} rows={2} placeholder={t('settings.profile.projectsPlaceholder')} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.profile.location')} error={fieldError(error, 'location')}>
              {(p) => <Input {...p} value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={LIMITS.locationMax} placeholder={t('settings.profile.locationPlaceholder')} />}
            </Field>
            <Field label={t('settings.profile.timezone')} hint={t('settings.profile.timezoneHint')} error={fieldError(error, 'timezone')}>
              {(p) => (
                <Select {...p} value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                  <option value="">{t('settings.profile.timezoneNone')}</option>
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.profile.disciplines')}>
        <DisciplinePicker value={form.disciplines} onChange={(v) => set('disciplines', v)} label={t('settings.profile.disciplines')} />
      </SettingsCard>

      <SettingsCard title={t('settings.profile.links')}>
        <ul className="flex flex-col gap-3">
          {form.links.map((link, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex gap-2">
                <Input
                  aria-label={t('settings.profile.linkLabel')}
                  placeholder={t('settings.profile.linkLabel')}
                  value={link.label}
                  maxLength={40}
                  onChange={(e) => set('links', form.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                  className="w-32 sm:w-40"
                />
                <Input
                  aria-label="URL"
                  placeholder={t('settings.profile.linkUrl')}
                  value={link.url}
                  type="url"
                  inputMode="url"
                  onChange={(e) => set('links', form.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
                  aria-invalid={linkError(i) ? true : undefined}
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" aria-label={t('common.actions.remove')} onClick={() => set('links', form.links.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              {linkError(i) && (
                <p role="alert" className="text-xs text-danger">
                  {linkError(i)}
                </p>
              )}
            </li>
          ))}
        </ul>
        {form.links.length < LIMITS.profileLinksMax && (
          <Button size="sm" className="mt-3" onClick={() => set('links', [...form.links, { label: '', url: 'https://' }])}>
            <Plus /> {t('settings.profile.addLink')}
          </Button>
        )}
      </SettingsCard>

      {generalError && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {generalError}
        </p>
      )}
      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-gradient-to-t from-main via-main to-transparent px-1 pt-6 pb-4">
        <Button variant="ghost" disabled={!dirty || busy} onClick={() => setForm(fromUser(user))}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty || !form.displayName.trim()} data-testid="save-profile">
          {t('common.actions.saveChanges')}
        </Button>
      </div>
    </form>
  );
}
