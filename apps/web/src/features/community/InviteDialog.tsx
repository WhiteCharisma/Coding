import { Permission, type CommunityDTO, type InviteDTO } from '@creator-network/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Send, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Field, Input, Select } from '../../components/ui/input';
import { toast } from '../../components/ui/toast';
import { hasCommunityPerm } from './hooks';

const EXPIRY_OPTIONS: { value: string; hours: number | null }[] = [
  { value: '1', hours: 1 },
  { value: '24', hours: 24 },
  { value: '168', hours: 168 },
  { value: '720', hours: 720 },
  { value: 'never', hours: null },
];
const USE_OPTIONS = ['unlimited', '1', '5', '10', '25', '100'];

export const inviteUrl = (code: string) => `${window.location.origin}/invite/${code}`;

function expiryLabel(hours: number | null): string {
  if (hours === null) return t('community.invite.never');
  if (hours < 24) return t('community.invite.hours', { count: hours });
  return t('community.invite.days', { count: hours / 24 });
}

export function InviteList({ invites, onRevoked }: { invites: InviteDTO[]; onRevoked: () => void }) {
  if (invites.length === 0) return <p className="text-sm text-fg-muted">{t('community.invite.noActive')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
      {invites.map((inv) => (
        <li key={inv.code} className="flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-sm text-fg">{inv.code}</span>
            <span className="block truncate text-xs text-fg-muted">
              {inv.targetUser ? `→ @${inv.targetUser.username} · ` : ''}
              {inv.maxUses
                ? t('community.invite.usedCount', { uses: inv.uses, max: inv.maxUses })
                : t('community.invite.usedCountUnlimited', { uses: inv.uses })}
              {' · '}
              {inv.expiresAt
                ? t('community.invite.expiresAt', { date: formatRelative(inv.expiresAt).replace(/^in /, '') })
                : t('community.invite.noExpiry')}
              {inv.inviter ? ` · ${inv.inviter.displayName}` : ''}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('common.actions.copyLink')}
            onClick={() =>
              void navigator.clipboard
                .writeText(inviteUrl(inv.code))
                .then(() => toast.success(t('common.actions.copied')))
            }
          >
            <Copy />
          </Button>
          <Button
            variant="danger-ghost"
            size="icon-sm"
            aria-label={t('common.actions.revoke')}
            onClick={() =>
              void api
                .del(`/api/invites/${inv.code}`)
                .then(onRevoked)
                .catch((err: unknown) => toast.error(errorMessage(err)))
            }
          >
            <Trash2 />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function InviteDialog({
  community,
  open,
  onOpenChange,
}: {
  community: CommunityDTO;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const canInvite = hasCommunityPerm(community, Permission.CREATE_INVITES);
  const [expiry, setExpiry] = useState('168');
  const [uses, setUses] = useState('unlimited');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [directBusy, setDirectBusy] = useState(false);
  const invites = useQuery({
    queryKey: ['community', community.id, 'invites'],
    queryFn: () => api.get<{ invites: InviteDTO[] }>(`/api/communities/${community.id}/invites`).then((r) => r.invites),
    enabled: open && canInvite,
  });

  const create = async () => {
    setBusy(true);
    try {
      const hours = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.hours ?? null;
      const { invite } = await api.post<{ invite: InviteDTO }>(`/api/communities/${community.id}/invites`, {
        expiresInHours: hours,
        maxUses: uses === 'unlimited' ? null : Number(uses),
      });
      setLink(inviteUrl(invite.code));
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ['community', community.id, 'invites'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendDirect = async (e: FormEvent) => {
    e.preventDefault();
    setDirectBusy(true);
    try {
      await api.post(`/api/communities/${community.id}/invites`, {
        targetUsername: username.trim().replace(/^@/, '').toLowerCase(),
        expiresInHours: 168,
      });
      toast.success(t('community.invite.directSent', { username: username.replace(/^@/, '') }));
      setUsername('');
      void qc.invalidateQueries({ queryKey: ['community', community.id, 'invites'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDirectBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('community.invite.title', { name: community.name })} size="lg">
        {!canInvite ? (
          <p className="text-sm text-fg-muted">{t('community.invite.noPermission')}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('community.invite.expires')}>
                  {(p) => (
                    <Select {...p} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                      {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {expiryLabel(o.hours)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t('community.invite.maxUses')}>
                  {(p) => (
                    <Select {...p} value={uses} onChange={(e) => setUses(e.target.value)}>
                      {USE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o === 'unlimited'
                            ? t('community.invite.unlimited')
                            : t('community.invite.uses', { count: Number(o) })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {link ? (
                <div className="flex items-center gap-2 rounded-lg border border-accent-border bg-accent-soft p-1.5 pl-3">
                  <Link2 className="size-4 shrink-0 text-accent-text" />
                  <input
                    readOnly
                    value={link}
                    aria-label={t('community.invite.linkLabel')}
                    onFocus={(e) => e.target.select()}
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-fg focus:outline-none"
                    data-testid="invite-link"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      void navigator.clipboard.writeText(link).then(() => {
                        setCopied(true);
                        toast.success(t('common.actions.copied'));
                      })
                    }
                  >
                    {copied ? <Check /> : <Copy />} {copied ? t('common.actions.copied') : t('common.actions.copy')}
                  </Button>
                </div>
              ) : null}
              <Button
                variant={link ? 'secondary' : 'primary'}
                loading={busy}
                onClick={() => void create()}
                data-testid="create-invite"
              >
                <Link2 /> {t('community.invite.generate')}
              </Button>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium text-fg-2">{t('community.invite.direct')}</h3>
              <form onSubmit={(e) => void sendDirect(e)} className="flex gap-2">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('community.invite.directPlaceholder')}
                  aria-label={t('community.invite.directPlaceholder')}
                  className="flex-1"
                />
                <Button type="submit" loading={directBusy} disabled={username.trim().length < 3}>
                  <Send /> {t('community.invite.directSend')}
                </Button>
              </form>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-medium text-fg-2">{t('community.invite.active')}</h3>
              {invites.data && <InviteList invites={invites.data} onRevoked={() => void invites.refetch()} />}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
