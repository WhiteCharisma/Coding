import {
  COMMUNITY_TAGS,
  COMMUNITY_TEMPLATES,
  type CommunityDTO,
  type CommunityTag,
  type CommunityTemplate,
} from '@creator-network/shared';
import { Compass, Disc3, Gamepad2, Palette, Plus, Sparkles, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage, fieldError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Field, Input, Textarea } from '../../components/ui/input';
import { Segmented } from '../../components/ui/segmented';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

const TEMPLATE_ICONS: Record<CommunityTemplate, typeof Users> = {
  blank: Sparkles,
  'music-collective': Users,
  'record-label': Disc3,
  'game-studio': Gamepad2,
  'art-collective': Palette,
};

export function parseInviteCode(input: string): string | null {
  const m = /(?:\/invite\/)?([A-Za-z0-9]{6,32})\/?$/.exec(input.trim());
  return m?.[1] ?? null;
}

export function CreateCommunityForm({
  onCreated,
  compact,
}: {
  onCreated: (c: CommunityDTO) => void;
  compact?: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<CommunityTemplate>('music-collective');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [tags, setTags] = useState<CommunityTag[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { community } = await api.post<{ community: CommunityDTO }>('/api/communities', {
        name,
        description,
        template,
        visibility,
        tags,
      });
      useChat.getState().upsertCommunity(community);
      onCreated(community);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <Field label={t('community.create.name')} error={fieldError(error, 'name')}>
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('community.create.namePlaceholder')}
            maxLength={60}
            required
            autoFocus
          />
        )}
      </Field>
      <Field
        label={t('community.create.description')}
        optional={t('common.labels.optional')}
        error={fieldError(error, 'description')}
      >
        {(p) => (
          <Textarea
            {...p}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('community.create.descriptionPlaceholder')}
            maxLength={500}
            rows={compact ? 2 : 3}
          />
        )}
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg-2">{t('community.create.template')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMMUNITY_TEMPLATES.map((tpl) => {
            const Icon = TEMPLATE_ICONS[tpl];
            const selected = template === tpl;
            return (
              <label
                key={tpl}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-[border-color,background-color] duration-[var(--dur-fast)]',
                  selected ? 'border-accent-border bg-accent-soft' : 'border-line bg-inset hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="template"
                  value={tpl}
                  checked={selected}
                  onChange={() => setTemplate(tpl)}
                  className="sr-only"
                />
                <Icon className={cn('mt-0.5 size-4 shrink-0', selected ? 'text-accent-text' : 'text-fg-muted')} />
                <span>
                  <span className="block text-ui font-medium text-fg">{t(`community.create.templates.${tpl}`)}</span>
                  <span className="block text-xs text-fg-muted">{t(`community.create.templateHints.${tpl}`)}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg-2">{t('community.create.visibility')}</span>
        <Segmented
          label={t('community.create.visibility')}
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'private', label: t('common.labels.private') },
            { value: 'public', label: t('common.labels.public') },
          ]}
        />
        <p className="text-xs text-fg-muted">
          {visibility === 'public' ? t('community.create.visibilityPublic') : t('community.create.visibilityPrivate')}
        </p>
      </div>
      {visibility === 'public' && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg-2">{t('community.create.tags')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {COMMUNITY_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setTags((cur) => (on ? cur.filter((x) => x !== tag) : cur.length < 5 ? [...cur, tag] : cur))
                  }
                  className="chip px-3 py-1 text-sm"
                >
                  {t(`common.tags.${tag}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      {error !== null && !fieldError(error, 'name') && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy} disabled={name.trim().length < 2}>
        <Plus /> {t('community.create.submit')}
      </Button>
    </form>
  );
}

export function JoinWithInvite({ onJoined }: { onJoined: (c: CommunityDTO) => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const join = async (e: FormEvent) => {
    e.preventDefault();
    const code = parseInviteCode(value);
    if (!code) {
      setError(t('auth.invite.invalidBody'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { community } = await api.post<{ community: CommunityDTO }>(`/api/invites/${code}/accept`);
      useChat.getState().upsertCommunity(community);
      onJoined(community);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void join(e)} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('community.join.invitePlaceholder')}
          aria-label={t('onboarding.community.haveInvite')}
          className="flex-1"
        />
        <Button type="submit" variant="primary" loading={busy} disabled={!value.trim()}>
          {t('community.join.useInvite')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export function CreateJoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const go = (c: CommunityDTO) => {
    onOpenChange(false);
    void navigate(`/c/${c.id}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('community.create.title')} description={t('community.create.subtitle')} size="lg">
        <Tabs defaultValue="create">
          <TabsList className="mb-4">
            <TabsTrigger value="create">{t('community.create.submit')}</TabsTrigger>
            <TabsTrigger value="join">{t('community.join.title')}</TabsTrigger>
          </TabsList>
          <TabsContent value="create">
            <CreateCommunityForm onCreated={go} />
          </TabsContent>
          <TabsContent value="join" className="flex flex-col gap-5">
            <JoinWithInvite onJoined={go} />
            <div className="flex items-center gap-3 text-xs text-fg-muted">
              <div className="h-px flex-1 bg-line-subtle" /> {t('community.join.or')}{' '}
              <div className="h-px flex-1 bg-line-subtle" />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                void navigate('/explore');
              }}
            >
              <Compass /> {t('community.join.explore')}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
