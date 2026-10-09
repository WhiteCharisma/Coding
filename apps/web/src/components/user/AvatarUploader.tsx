import type { SelfUser } from '@creator-network/shared';
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { squareImage } from '../../lib/image';
import { useSession } from '../../stores/session';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { toast } from '../ui/toast';
import { UserAvatar } from './UserAvatar';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/** Profile picture picker: crops to a square in the browser, uploads, updates the session user. */
export function AvatarUploader({ hint }: { hint?: string }) {
  const user = useSession((s) => s.user);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', await squareImage(file, 384));
      const res = await api.post<{ user: SelfUser }>('/api/me/avatar', form);
      useSession.getState().setUser(res.user);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api.del<{ user: SelfUser }>('/api/me/avatar');
      useSession.getState().setUser(res.user);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={t('settings.profile.avatar')}
        disabled={busy}
      >
        <UserAvatar name={user.displayName} src={user.avatarUrl} size="2xl" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? <Spinner /> : <Camera className="size-6" />}
        </span>
      </button>
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => input.current?.click()} loading={busy}>
            <Camera /> {t('settings.profile.avatar')}
          </Button>
          {user.avatarUrl && (
            <Button size="sm" variant="danger-ghost" onClick={() => void remove()} disabled={busy}>
              <Trash2 /> {t('settings.profile.removeAvatar')}
            </Button>
          )}
        </div>
        {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
