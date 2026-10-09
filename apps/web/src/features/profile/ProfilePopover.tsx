import { MessageCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../lib/api';
import { localTimeIn } from '../../lib/format';
import { useChat } from '../../stores/chat';
import { useSession } from '../../stores/session';
import { DemoBadge } from '../../components/ui/badge';
import { Button, buttonVariants } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Skeleton } from '../../components/ui/skeleton';
import { toast } from '../../components/ui/toast';
import { UserAvatar } from '../../components/user/UserAvatar';
import { openDmWith } from '../dm/NewDmDialog';
import { bannerStyle, useProfile } from './useProfile';

export function ProfilePopover({
  username,
  children,
  side = 'right',
  disabled,
}: {
  username: string;
  children: ReactNode;
  side?: 'right' | 'left' | 'top' | 'bottom';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const profile = useProfile(username, open);
  const me = useSession((s) => s.user);
  const navigate = useNavigate();
  const p = profile.data;
  const presence = useChat((s) => (p ? (s.presence[p.id] ?? 'offline') : 'offline'));
  if (disabled) return <>{children}</>;
  const local = p?.timezone ? localTimeIn(p.timezone) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align="start" className="w-80 overflow-hidden p-0">
        {!p ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        ) : (
          <div>
            <div className="h-20" style={bannerStyle(p.bannerHue)} />
            <div className="px-4 pb-4">
              <div className="-mt-9 mb-2">
                <UserAvatar
                  name={p.displayName}
                  src={p.avatarUrl}
                  size="xl"
                  presence={presence}
                  className="rounded-full ring-4 ring-overlay"
                />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="truncate font-display text-lg font-semibold tracking-tight text-fg">{p.displayName}</h3>
                {p.isDemo && <DemoBadge />}
              </div>
              <p className="text-sm text-fg-muted">@{p.username}</p>
              {p.headline && <p className="mt-2 text-sm text-fg-2">{p.headline}</p>}
              {p.disciplines.length > 0 && (
                <ul className="mt-2.5 flex flex-wrap gap-1">
                  {p.disciplines.slice(0, 5).map((d) => (
                    <li key={d} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2">
                      {t(`common.disciplines.${d}`)}
                    </li>
                  ))}
                </ul>
              )}
              {local && (
                <p className="mt-2.5 font-mono text-[11px] text-fg-muted">{t('profile.localTime', { time: local })}</p>
              )}
              <div className="mt-4 flex gap-2">
                {p.id !== me?.id && p.canMessage && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1"
                    onClick={() =>
                      void openDmWith([p.id])
                        .then((dm) => {
                          setOpen(false);
                          void navigate(`/dm/${dm.id}`);
                        })
                        .catch((err: unknown) => toast.error(errorMessage(err)))
                    }
                  >
                    <MessageCircle /> {t('profile.sendMessage')}
                  </Button>
                )}
                <Link
                  to={`/u/${p.username}`}
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ size: 'sm', className: 'flex-1' })}
                >
                  {t('common.actions.viewProfile')}
                </Link>
              </div>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
