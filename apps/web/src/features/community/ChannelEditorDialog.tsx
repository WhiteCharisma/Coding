import {
  CHANNEL_PERMISSIONS,
  Permission,
  permissionNames,
  type ChannelDTO,
  type CommunityDTO,
  type OverwriteDTO,
  type PermissionName,
} from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Minus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { t } from '../../i18n';
import { api, errorMessage, fieldError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useChat } from '../../stores/chat';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Field, Input, Select, Textarea } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { toast } from '../../components/ui/toast';

const CHANNEL_PERMS = permissionNames(CHANNEL_PERMISSIONS);

type Tri = 'inherit' | 'allow' | 'deny';

function triOf(ow: OverwriteDTO | undefined, bit: number): Tri {
  if (!ow) return 'inherit';
  if (ow.allow & bit) return 'allow';
  if (ow.deny & bit) return 'deny';
  return 'inherit';
}

function TriToggle({ value, onChange, label }: { value: Tri; onChange: (v: Tri) => void; label: string }) {
  const opts: { v: Tri; icon: typeof Check; text: string; cls: string }[] = [
    {
      v: 'deny',
      icon: X,
      text: t('community.settings.channels.deny'),
      cls: 'data-[on=true]:bg-danger data-[on=true]:text-danger-fg',
    },
    {
      v: 'inherit',
      icon: Minus,
      text: t('community.settings.channels.inherit'),
      cls: 'data-[on=true]:bg-overlay data-[on=true]:text-fg',
    },
    {
      v: 'allow',
      icon: Check,
      text: t('community.settings.channels.allow'),
      cls: 'data-[on=true]:bg-success data-[on=true]:text-success-fg',
    },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-inset p-0.5">
      {opts.map(({ v, icon: Icon, text, cls }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={text}
          title={text}
          data-on={value === v}
          onClick={() => onChange(v)}
          className={cn('grid size-7 place-items-center rounded text-fg-muted transition-colors', cls)}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function PermissionsEditor({ community, channel }: { community: CommunityDTO; channel: ChannelDTO }) {
  const [roleId, setRoleId] = useState(community.everyoneRoleId);
  const overwrites = useQuery({
    queryKey: ['overwrites', channel.id],
    queryFn: () =>
      api.get<{ overwrites: OverwriteDTO[] }>(`/api/channels/${channel.id}/overwrites`).then((r) => r.overwrites),
  });
  const roles = [...community.roles].sort((a, b) => b.position - a.position);
  const current = overwrites.data?.find((o) => o.targetType === 'role' && o.targetId === roleId);

  const set = async (perm: PermissionName, value: Tri) => {
    const bit = Permission[perm];
    let allow = (current?.allow ?? 0) & ~bit;
    let deny = (current?.deny ?? 0) & ~bit;
    if (value === 'allow') allow |= bit;
    if (value === 'deny') deny |= bit;
    try {
      await api.put(`/api/channels/${channel.id}/overwrites`, { targetType: 'role', targetId: roleId, allow, deny });
      void overwrites.refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t('community.settings.channels.permissionsHint')}</p>
      <Select
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        aria-label={t('community.settings.roles.title')}
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
        {CHANNEL_PERMS.map((perm) => (
          <li key={perm} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-ui text-fg">{t(`community.permissions.${perm}`)}</span>
              <span className="block text-xs text-fg-muted">{t(`community.permissionHints.${perm}`)}</span>
            </span>
            <TriToggle
              label={t(`community.permissions.${perm}`)}
              value={triOf(current, Permission[perm])}
              onChange={(v) => void set(perm, v)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ChannelEditorProps {
  community: CommunityDTO;
  channel?: ChannelDTO;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ChannelEditorDialog({ community, channel, open, onOpenChange }: ChannelEditorProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(channel?.name ?? '');
  const [topic, setTopic] = useState(channel?.topic ?? '');
  const [categoryId, setCategoryId] = useState<string>(channel?.categoryId ?? community.categories[0]?.id ?? '');
  const [isPrivate, setIsPrivate] = useState(channel?.isPrivate ?? false);
  const [allowedRoleIds, setAllowedRoleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const roles = community.roles.filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (channel) {
        await api.patch(`/api/channels/${channel.id}`, { name, topic, categoryId: categoryId || null });
        if (isPrivate !== channel.isPrivate)
          await api.put(`/api/channels/${channel.id}/privacy`, { isPrivate, allowedRoleIds });
        toast.success(t('community.settings.overview.saved'));
      } else {
        const res = await api.post<{ channel: ChannelDTO }>(`/api/communities/${community.id}/channels`, {
          name,
          topic,
          categoryId: categoryId || null,
          isPrivate,
          allowedRoleIds,
        });
        toast.success(t('community.settings.channels.created'));
        onOpenChange(false);
        void navigate(`/c/${community.id}/${res.channel.id}`);
        return;
      }
      onOpenChange(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const details = (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <Field
        label={t('community.settings.channels.channelName')}
        error={fieldError(error, 'name')}
        hint="#lowercase-with-dashes"
      >
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
            autoFocus={!channel}
            placeholder="feedback-loop"
          />
        )}
      </Field>
      <Field label={t('community.settings.channels.topic')} optional={t('common.labels.optional')}>
        {(p) => (
          <Textarea
            {...p}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder={t('community.settings.channels.topicPlaceholder')}
          />
        )}
      </Field>
      <Field label={t('community.settings.channels.category')}>
        {(p) => (
          <Select {...p} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t('community.settings.channels.noCategory')}</option>
            {community.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Switch
        checked={isPrivate}
        onCheckedChange={setIsPrivate}
        label={t('community.settings.channels.private')}
        description={t('community.settings.channels.privateHint')}
      />
      {isPrivate && roles.length > 0 && (!channel || !channel.isPrivate) && (
        <fieldset className="rounded-lg border border-line-subtle p-3">
          <legend className="px-1 text-sm font-medium text-fg-2">
            {t('community.settings.channels.allowedRoles')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm text-fg-2 has-[:checked]:border-accent-border has-[:checked]:bg-accent-soft"
              >
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={allowedRoleIds.includes(r.id)}
                  onChange={(e) =>
                    setAllowedRoleIds((cur) => (e.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id)))
                  }
                />
                <span style={r.color ? { color: r.color } : undefined}>{r.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error !== null && !fieldError(error, 'name') && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {errorMessage(error)}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {channel ? (
          <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> {t('common.actions.delete')}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
          {channel ? t('common.actions.saveChanges') : t('community.sidebar.createChannel')}
        </Button>
      </div>
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={channel ? `#${channel.name}` : t('community.sidebar.createChannel')} size="lg">
        {channel ? (
          <Tabs defaultValue="details">
            <TabsList className="mb-4">
              <TabsTrigger value="details">{t('community.settings.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="permissions">{t('community.settings.channels.permissions')}</TabsTrigger>
            </TabsList>
            <TabsContent value="details">{details}</TabsContent>
            <TabsContent value="permissions">
              <PermissionsEditor community={community} channel={channel} />
            </TabsContent>
          </Tabs>
        ) : (
          details
        )}
        {channel && (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={t('community.settings.channels.deleteChannelTitle', { name: channel.name })}
            body={t('community.settings.channels.deleteChannelBody')}
            confirmLabel={t('common.actions.delete')}
            danger
            onConfirm={async () => {
              await api.del(`/api/channels/${channel.id}`);
              onOpenChange(false);
              const next = useChat.getState().communities[community.id]?.channels.find((c) => c.id !== channel.id);
              void navigate(next ? `/c/${community.id}/${next.id}` : `/c/${community.id}`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
