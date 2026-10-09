import {
  ALL_PERMISSIONS,
  COMMUNITY_TAGS,
  Permission,
  permissionNames,
  type AuditEventDTO,
  type ChannelDTO,
  type CommunityDTO,
  type CommunityTag,
  type InviteDTO,
  type MemberDTO,
  type PermissionName,
  type RoleDTO,
  type UserSummary,
} from '@creator-network/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Crown,
  ImagePlus,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UserMinus,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { t, tMaybe } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime } from '../../lib/format';
import { squareImage } from '../../lib/image';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/confirm';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { EmptyState } from '../../components/ui/empty-state';
import { Field, Input, Textarea } from '../../components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/menu';
import { Segmented } from '../../components/ui/segmented';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { toast } from '../../components/ui/toast';
import { CommunityIcon } from '../../components/community/CommunityIcon';
import { UserAvatar } from '../../components/user/UserAvatar';
import { CategoryDialog } from './CategoryDialog';
import { ChannelEditorDialog } from './ChannelEditorDialog';
import { hasCommunityPerm } from './hooks';
import { InviteList } from './InviteDialog';

const can = (c: CommunityDTO, p: number) => hasCommunityPerm(c, p);

function Section({
  title,
  hint,
  children,
  actions,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-fg">{title}</h3>
          {hint && <p className="mt-0.5 text-sm text-fg-muted">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Overview */

function OverviewTab({ community }: { community: CommunityDTO }) {
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description);
  const [visibility, setVisibility] = useState(community.visibility);
  const [tags, setTags] = useState<CommunityTag[]>(community.tags);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = can(community, Permission.MANAGE_COMMUNITY);

  const save = async () => {
    setBusy(true);
    try {
      const { community: updated } = await api.patch<{ community: CommunityDTO }>(`/api/communities/${community.id}`, {
        name,
        description,
        visibility,
        tags,
      });
      useChat.getState().upsertCommunity(updated);
      toast.success(t('community.settings.overview.saved'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const uploadIcon = async (file: File) => {
    const form = new FormData();
    form.append('file', await squareImage(file, 256));
    try {
      const { community: updated } = await api.post<{ community: CommunityDTO }>(
        `/api/communities/${community.id}/icon`,
        form,
      );
      useChat.getState().upsertCommunity(updated);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <CommunityIcon name={community.name} src={community.iconUrl} size="xl" />
        {editable && (
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => e.target.files?.[0] && void uploadIcon(e.target.files[0])}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus /> {t('common.actions.upload')}
              </Button>
              {community.iconUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void api
                      .del<{ community: CommunityDTO }>(`/api/communities/${community.id}/icon`)
                      .then((r) => useChat.getState().upsertCommunity(r.community))
                      .catch((err: unknown) => toast.error(errorMessage(err)))
                  }
                >
                  {t('community.settings.overview.removeIcon')}
                </Button>
              )}
            </div>
            <p className="text-xs text-fg-muted">{t('community.settings.overview.iconHint')}</p>
          </div>
        )}
      </div>
      <Field label={t('community.create.name')}>
        {(p) => (
          <Input {...p} value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} maxLength={60} />
        )}
      </Field>
      <Field label={t('community.create.description')}>
        {(p) => (
          <Textarea
            {...p}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!editable}
            maxLength={500}
            rows={3}
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg-2">{t('community.create.visibility')}</span>
        <Segmented
          label={t('community.create.visibility')}
          value={visibility}
          onChange={(v) => editable && setVisibility(v)}
          options={[
            { value: 'private', label: t('common.labels.private') },
            { value: 'public', label: t('common.labels.public') },
          ]}
        />
        <p className="text-xs text-fg-muted">
          {visibility === 'public' ? t('community.create.visibilityPublic') : t('community.create.visibilityPrivate')}
        </p>
      </div>
      <fieldset disabled={!editable}>
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
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  on
                    ? 'border-accent-border bg-accent-soft text-accent-text'
                    : 'border-line text-fg-2 hover:border-line-strong',
                )}
              >
                {t(`common.tags.${tag}`)}
              </button>
            );
          })}
        </div>
      </fieldset>
      {editable && (
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {t('common.actions.saveChanges')}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Channels */

function ChannelsTab({ community }: { community: CommunityDTO }) {
  const [editing, setEditing] = useState<ChannelDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [catDialog, setCatDialog] = useState<{ open: boolean; id?: string }>({ open: false });
  const [deleteCat, setDeleteCat] = useState<string | null>(null);
  const editable = can(community, Permission.MANAGE_CHANNELS);
  const groups = [
    {
      id: null as string | null,
      name: t('community.sidebar.uncategorized'),
      channels: community.channels.filter((c) => !c.categoryId),
    },
    ...community.categories.map((cat) => ({
      id: cat.id as string | null,
      name: cat.name,
      channels: community.channels.filter((c) => c.categoryId === cat.id),
    })),
  ];

  const move = async (list: ChannelDTO[], index: number, dir: -1 | 1) => {
    const a = list[index];
    const b = list[index + dir];
    if (!a || !b) return;
    try {
      await api.patch(`/api/channels/${a.id}`, { position: b.position });
      await api.patch(`/api/channels/${b.id}`, {
        position: a.position === b.position ? a.position + dir * -1 : a.position,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Section
      title={t('community.settings.channels.title')}
      actions={
        editable && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCatDialog({ open: true })}>
              <Plus /> {t('community.settings.channels.newCategory')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus /> {t('community.settings.channels.newChannel')}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.id ?? 'none'} className="rounded-lg border border-line-subtle">
            <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
              <span className="text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">{g.name}</span>
              {g.id && editable && (
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('common.actions.edit')}
                    onClick={() => setCatDialog({ open: true, id: g.id ?? undefined })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="icon-xs"
                    aria-label={t('common.actions.delete')}
                    onClick={() => setDeleteCat(g.id)}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </div>
            <ul className="divide-y divide-line-subtle">
              {g.channels.map((ch, i) => (
                <li key={ch.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-ui text-fg">#{ch.name}</span>
                  {ch.isPrivate && (
                    <span className="text-2xs text-fg-muted uppercase">{t('common.labels.private')}</span>
                  )}
                  {editable && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('community.settings.channels.moveUp')}
                        disabled={i === 0}
                        onClick={() => void move(g.channels, i, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('community.settings.channels.moveDown')}
                        disabled={i === g.channels.length - 1}
                        onClick={() => void move(g.channels, i, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('common.actions.edit')}
                        onClick={() => setEditing(ch)}
                      >
                        <Pencil />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {editing && (
        <ChannelEditorDialog
          community={community}
          channel={editing}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
      {creating && <ChannelEditorDialog community={community} open onOpenChange={setCreating} />}
      {catDialog.open && (
        <CategoryDialog
          community={community}
          category={community.categories.find((c) => c.id === catDialog.id)}
          open
          onOpenChange={(o) => setCatDialog({ open: o })}
        />
      )}
      <ConfirmDialog
        open={deleteCat !== null}
        onOpenChange={(o) => !o && setDeleteCat(null)}
        title={t('community.settings.channels.deleteCategoryTitle', {
          name: community.categories.find((c) => c.id === deleteCat)?.name ?? '',
        })}
        body={t('community.settings.channels.deleteCategoryBody')}
        confirmLabel={t('common.actions.delete')}
        danger
        onConfirm={() => api.del(`/api/categories/${deleteCat}`)}
      />
    </Section>
  );
}

/* ------------------------------------------------------------------- Roles */

const ROLE_PERMS = permissionNames(ALL_PERMISSIONS);

function RoleEditor({
  community,
  role,
  myHighest,
  onClose,
}: {
  community: CommunityDTO;
  role: RoleDTO;
  myHighest: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? '#f0b45a');
  const [useColor, setUseColor] = useState(role.color !== null);
  const [hoist, setHoist] = useState(role.hoist);
  const [perms, setPerms] = useState(role.permissions);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const owner = useSession((s) => s.user?.id) === community.ownerId;
  const admin = (community.myPermissions & Permission.ADMINISTRATOR) !== 0;
  const editable = role.isDefault || owner || role.position < myHighest;

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(
        `/api/roles/${role.id}`,
        role.isDefault ? { permissions: perms } : { name, color: useColor ? color : null, hoist, permissions: perms },
      );
      toast.success(t('community.settings.overview.saved'));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!role.isDefault && (
        <>
          <Field label={t('community.settings.roles.name')}>
            {(p) => (
              <Input
                {...p}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                disabled={!editable}
              />
            )}
          </Field>
          <div className="flex items-center gap-3">
            <Switch
              checked={useColor}
              onCheckedChange={setUseColor}
              label={t('community.settings.roles.color')}
              className="flex-1"
              disabled={!editable}
            />
            {useColor && (
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label={t('community.settings.roles.color')}
                className="h-9 w-14 cursor-pointer rounded-md border border-line bg-inset"
                disabled={!editable}
              />
            )}
          </div>
          <Switch
            checked={hoist}
            onCheckedChange={setHoist}
            label={t('community.settings.roles.hoist')}
            disabled={!editable}
          />
        </>
      )}
      {role.isDefault && <p className="text-sm text-fg-muted">{t('community.settings.roles.everyoneHint')}</p>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-fg-2">{t('community.settings.roles.permissions')}</legend>
        <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
          {ROLE_PERMS.map((perm: PermissionName) => {
            const bit = Permission[perm];
            const iHave = owner || admin || (community.myPermissions & bit) !== 0;
            return (
              <li key={perm} className="px-3">
                <Switch
                  checked={(perms & bit) !== 0}
                  onCheckedChange={(on) => setPerms((p) => (on ? p | bit : p & ~bit))}
                  label={t(`community.permissions.${perm}`)}
                  description={t(`community.permissionHints.${perm}`)}
                  disabled={!editable || !iHave}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="flex items-center justify-between">
        {!role.isDefault && editable ? (
          <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> {t('common.actions.delete')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          {editable && (
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {t('common.actions.saveChanges')}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('community.settings.roles.deleteTitle', { name: role.name })}
        body={t('community.settings.roles.deleteBody')}
        confirmLabel={t('common.actions.delete')}
        danger
        onConfirm={async () => {
          await api.del(`/api/roles/${role.id}`);
          onClose();
        }}
      />
    </div>
  );
}

function RolesTab({ community, members }: { community: CommunityDTO; members: MemberDTO[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const me = useSession((s) => s.user);
  const roles = useQuery({
    queryKey: [
      'community',
      community.id,
      'roles',
      community.roles.map((r) => `${r.id}${r.position}${r.permissions}`).join(),
    ],
    queryFn: () => api.get<{ roles: RoleDTO[] }>(`/api/communities/${community.id}/roles`).then((r) => r.roles),
  });
  const list = roles.data ?? community.roles;
  const myRoles = members.find((m) => m.user.id === me?.id)?.roleIds ?? [];
  const myHighest =
    me?.id === community.ownerId
      ? Number.POSITIVE_INFINITY
      : Math.max(0, ...list.filter((r) => myRoles.includes(r.id)).map((r) => r.position));
  const editable = can(community, Permission.MANAGE_ROLES);
  const role = list.find((r) => r.id === selected);

  if (role)
    return <RoleEditor community={community} role={role} myHighest={myHighest} onClose={() => setSelected(null)} />;
  return (
    <Section
      title={t('community.settings.roles.title')}
      hint={t('community.settings.roles.hint')}
      actions={
        editable && (
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              void api
                .post<{ role: RoleDTO }>(`/api/communities/${community.id}/roles`, {
                  name: t('community.settings.roles.newRole'),
                  permissions: 0,
                })
                .then((r) => setSelected(r.role.id))
                .catch((err: unknown) => toast.error(errorMessage(err)))
            }
          >
            <Plus /> {t('community.settings.roles.newRole')}
          </Button>
        )
      }
    >
      <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
        {[...list]
          .sort((a, b) => b.position - a.position)
          .map((r, i, arr) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2.5">
              <span
                className="size-3 shrink-0 rounded-full border border-line"
                style={{ background: r.color ?? 'transparent' }}
                aria-hidden
              />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-ui text-fg hover:underline"
                onClick={() => setSelected(r.id)}
              >
                {r.name}
              </button>
              {r.memberCount !== undefined && (
                <span className="text-xs text-fg-muted">
                  {t('community.settings.roles.membersCount', { count: r.memberCount })}
                </span>
              )}
              {editable && !r.isDefault && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('community.settings.channels.moveUp')}
                    disabled={i === 0}
                    onClick={() =>
                      void api
                        .post(`/api/roles/${r.id}/move`, { direction: 'up' })
                        .then(() => roles.refetch())
                        .catch((err: unknown) => toast.error(errorMessage(err)))
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('community.settings.channels.moveDown')}
                    disabled={i >= arr.length - 2}
                    onClick={() =>
                      void api
                        .post(`/api/roles/${r.id}/move`, { direction: 'down' })
                        .then(() => roles.refetch())
                        .catch((err: unknown) => toast.error(errorMessage(err)))
                    }
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('common.actions.edit')}
                onClick={() => setSelected(r.id)}
              >
                <Pencil />
              </Button>
            </li>
          ))}
      </ul>
    </Section>
  );
}

/* ----------------------------------------------------------------- Members */

function MembersTab({
  community,
  members,
  refetch,
}: {
  community: CommunityDTO;
  members: MemberDTO[];
  refetch: () => void;
}) {
  const [q, setQ] = useState('');
  const [action, setAction] = useState<{ kind: 'kick' | 'ban' | 'transfer'; user: UserSummary } | null>(null);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const me = useSession((s) => s.user);
  const isOwner = me?.id === community.ownerId;
  const roles = community.roles.filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term
      ? members.filter((m) => m.user.username.includes(term) || m.user.displayName.toLowerCase().includes(term))
      : members;
  }, [members, q]);

  const setRoles = async (m: MemberDTO, roleIds: string[]) => {
    try {
      await api.put(`/api/communities/${community.id}/members/${m.user.id}/roles`, { roleIds });
      refetch();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Section title={t('community.settings.members.title')}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('community.settings.members.search')}
          aria-label={t('community.settings.members.search')}
          className="pl-9"
        />
      </div>
      <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
        {filtered.map((m) => {
          const isTargetOwner = m.user.id === community.ownerId;
          return (
            <li key={m.user.id} className="flex items-center gap-3 px-3 py-2.5">
              <UserAvatar name={m.user.displayName} src={m.user.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-ui font-medium text-fg">
                  {m.user.displayName}{' '}
                  {isTargetOwner && <Crown className="size-3.5 text-warning" aria-label={t('common.labels.owner')} />}
                </p>
                <p className="truncate text-xs text-fg-muted">
                  @{m.user.username} · {t('community.settings.members.joined', { date: formatDate(m.joinedAt) })}
                </p>
                {m.roleIds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.roleIds.map((id) => {
                      const r = community.roles.find((x) => x.id === id);
                      return r ? (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-px text-[11px] text-fg-2"
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: r.color ?? 'var(--text-faint)' }}
                          />{' '}
                          {r.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              {m.user.id !== me?.id && !isTargetOwner && (
                <Menu>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {t('common.actions.more')}
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-64">
                    {can(community, Permission.MANAGE_ROLES) &&
                      roles.map((r) => {
                        const has = m.roleIds.includes(r.id);
                        return (
                          <MenuItem
                            key={r.id}
                            onSelect={(e) => {
                              e.preventDefault();
                              void setRoles(m, has ? m.roleIds.filter((x) => x !== r.id) : [...m.roleIds, r.id]);
                            }}
                          >
                            <span
                              className={cn(
                                'grid size-4 place-items-center rounded border',
                                has ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
                              )}
                            >
                              {has ? '✓' : ''}
                            </span>
                            <span style={r.color ? { color: r.color } : undefined}>{r.name}</span>
                          </MenuItem>
                        );
                      })}
                    <MenuSeparator />
                    {can(community, Permission.KICK_MEMBERS) && (
                      <MenuItem danger onSelect={() => setAction({ kind: 'kick', user: m.user })}>
                        <UserMinus /> {t('community.settings.members.kick')}
                      </MenuItem>
                    )}
                    {can(community, Permission.BAN_MEMBERS) && (
                      <MenuItem danger onSelect={() => setAction({ kind: 'ban', user: m.user })}>
                        <Ban /> {t('community.settings.members.ban')}
                      </MenuItem>
                    )}
                    {isOwner && (
                      <MenuItem onSelect={() => setAction({ kind: 'transfer', user: m.user })}>
                        <Crown /> {t('community.settings.members.transfer')}
                      </MenuItem>
                    )}
                  </MenuContent>
                </Menu>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAction(null);
            setReason('');
            setPassword('');
          }
        }}
        title={action ? t(`community.settings.members.${action.kind}Title`, { name: action.user.displayName }) : ''}
        body={action ? t(`community.settings.members.${action.kind}Body`) : ''}
        confirmLabel={
          action?.kind === 'transfer'
            ? t('common.actions.confirm')
            : action?.kind === 'ban'
              ? t('community.settings.members.ban')
              : t('common.actions.remove')
        }
        danger={action?.kind !== 'transfer'}
        confirmDisabled={action?.kind === 'transfer' && !password}
        onConfirm={async () => {
          if (!action) return;
          if (action.kind === 'kick')
            await api.post(`/api/communities/${community.id}/members/${action.user.id}/kick`, { reason });
          if (action.kind === 'ban')
            await api.post(`/api/communities/${community.id}/bans/${action.user.id}`, { reason });
          if (action.kind === 'transfer') {
            const res = await api.post<{ community: CommunityDTO }>(`/api/communities/${community.id}/transfer`, {
              userId: action.user.id,
              password,
            });
            useChat.getState().upsertCommunity(res.community);
          }
          refetch();
        }}
      >
        {action && action.kind !== 'transfer' && (
          <Field label={t('community.settings.members.reason')} optional={t('common.labels.optional')}>
            {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
          </Field>
        )}
        {action?.kind === 'transfer' && (
          <Field label={t('community.settings.danger.password')}>
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
        )}
      </ConfirmDialog>
    </Section>
  );
}

/* ------------------------------------------------------- Invites/Bans/Audit */

function InvitesTab({ community }: { community: CommunityDTO }) {
  const invites = useQuery({
    queryKey: ['community', community.id, 'invites'],
    queryFn: () => api.get<{ invites: InviteDTO[] }>(`/api/communities/${community.id}/invites`).then((r) => r.invites),
  });
  return (
    <Section title={t('community.invite.active')}>
      {invites.data && <InviteList invites={invites.data} onRevoked={() => void invites.refetch()} />}
    </Section>
  );
}

function BansTab({ community }: { community: CommunityDTO }) {
  const bans = useQuery({
    queryKey: ['community', community.id, 'bans'],
    queryFn: () =>
      api
        .get<{ bans: { user: UserSummary; reason: string; createdAt: number }[] }>(
          `/api/communities/${community.id}/bans`,
        )
        .then((r) => r.bans),
  });
  return (
    <Section title={t('community.settings.bans.title')}>
      {bans.data?.length === 0 && <p className="text-sm text-fg-muted">{t('community.settings.bans.empty')}</p>}
      <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle empty:hidden">
        {bans.data?.map((b) => (
          <li key={b.user.id} className="flex items-center gap-3 px-3 py-2.5">
            <UserAvatar name={b.user.displayName} src={b.user.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui font-medium text-fg">{b.user.displayName}</p>
              <p className="truncate text-xs text-fg-muted">
                {b.reason || '—'} · {formatDate(b.createdAt)}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() =>
                void api
                  .del(`/api/communities/${community.id}/bans/${b.user.id}`)
                  .then(() => bans.refetch())
                  .catch((err: unknown) => toast.error(errorMessage(err)))
              }
            >
              {t('community.settings.bans.unban')}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function auditText(e: AuditEventDTO): string {
  const target = e.targetLabel ?? e.targetId ?? '';
  return tMaybe(`community.audit.${e.action}`, { target }) ?? t('community.audit.fallback', { action: e.action });
}

function AuditTab({ community }: { community: CommunityDTO }) {
  const audit = useQuery({
    queryKey: ['community', community.id, 'audit'],
    queryFn: () => api.get<{ events: AuditEventDTO[] }>(`/api/communities/${community.id}/audit`).then((r) => r.events),
  });
  return (
    <Section title={t('community.settings.audit.title')} hint={t('community.settings.audit.hint')}>
      {audit.data?.length === 0 && <p className="text-sm text-fg-muted">{t('community.settings.audit.empty')}</p>}
      <ol className="flex flex-col gap-1">
        {audit.data?.map((e) => (
          <li key={e.id} className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-hover">
            <UserAvatar name={e.actor?.displayName ?? '?'} src={e.actor?.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-fg">{e.actor?.displayName ?? 'System'}</span>{' '}
              <span className="text-fg-2">{auditText(e)}</span>
              {e.reason && <p className="text-xs text-fg-muted">“{e.reason}”</p>}
            </div>
            <time className="shrink-0 font-mono text-[11px] text-fg-muted">{formatDateTime(e.createdAt)}</time>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function DangerTab({ community, onDeleted }: { community: CommunityDTO; onDeleted: () => void }) {
  const me = useSession((s) => s.user);
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (me?.id !== community.ownerId)
    return <p className="text-sm text-fg-muted">{t('community.settings.danger.ownerOnly')}</p>;
  return (
    <Section title={t('community.settings.danger.deleteTitle')} hint={t('community.settings.danger.deleteBody')}>
      <div className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft/40 p-4">
        <Field label={t('community.settings.danger.confirmName')}>
          {(p) => (
            <Input
              {...p}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={community.name}
            />
          )}
        </Field>
        <Field label={t('community.settings.danger.password')}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button
          variant="danger"
          loading={busy}
          disabled={confirmName !== community.name || !password}
          onClick={async () => {
            setBusy(true);
            try {
              await api.del(`/api/communities/${community.id}`, { password, confirmName });
              useChat.getState().removeCommunity(community.id);
              onDeleted();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <ShieldAlert /> {t('community.settings.danger.deleteButton')}
        </Button>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ Dialog */

export function CommunitySettingsDialog({
  community,
  open,
  onOpenChange,
}: {
  community: CommunityDTO;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ['community', community.id, 'members'],
    queryFn: () => api.get<{ members: MemberDTO[] }>(`/api/communities/${community.id}/members`).then((r) => r.members),
    enabled: open,
  });
  const live = useChat((s) => s.communities[community.id]) ?? community;
  const tabs = [
    { key: 'overview', show: true },
    { key: 'channels', show: can(live, Permission.MANAGE_CHANNELS) },
    { key: 'roles', show: can(live, Permission.MANAGE_ROLES) },
    {
      key: 'members',
      show:
        can(live, Permission.MANAGE_ROLES) ||
        can(live, Permission.KICK_MEMBERS) ||
        can(live, Permission.BAN_MEMBERS) ||
        live.ownerId === useSession.getState().user?.id,
    },
    { key: 'invites', show: can(live, Permission.MANAGE_INVITES) },
    { key: 'bans', show: can(live, Permission.BAN_MEMBERS) },
    { key: 'audit', show: can(live, Permission.VIEW_AUDIT_LOG) },
    { key: 'danger', show: live.ownerId === useSession.getState().user?.id },
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('community.settings.title')}
        description={live.name}
        size="xl"
        className="sm:h-[min(85dvh,780px)]"
      >
        <Tabs defaultValue="overview">
          <TabsList className="mb-5">
            {tabs
              .filter((tb) => tb.show)
              .map((tb) => (
                <TabsTrigger key={tb.key} value={tb.key}>
                  {t(`community.settings.tabs.${tb.key}`)}
                </TabsTrigger>
              ))}
          </TabsList>
          <TabsContent value="overview">
            <OverviewTab community={live} />
          </TabsContent>
          <TabsContent value="channels">
            <ChannelsTab community={live} />
          </TabsContent>
          <TabsContent value="roles">
            {members.data ? <RolesTab community={live} members={members.data} /> : null}
          </TabsContent>
          <TabsContent value="members">
            {members.data ? (
              <MembersTab
                community={live}
                members={members.data}
                refetch={() => void qc.invalidateQueries({ queryKey: ['community', community.id, 'members'] })}
              />
            ) : (
              <EmptyState title={t('common.labels.loading')} />
            )}
          </TabsContent>
          <TabsContent value="invites">
            <InvitesTab community={live} />
          </TabsContent>
          <TabsContent value="bans">
            <BansTab community={live} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditTab community={live} />
          </TabsContent>
          <TabsContent value="danger">
            <DangerTab
              community={live}
              onDeleted={() => {
                onOpenChange(false);
                void navigate('/home');
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
