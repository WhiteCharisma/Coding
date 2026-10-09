import { MailWarning } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../stores/session';
import { toast } from '../../components/ui/toast';

/** Reminds users to confirm their email — only when email delivery actually works on this server. */
export function VerifyBanner() {
  const user = useSession((s) => s.user);
  const config = useSession((s) => s.config);
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified || !config?.emailEnabled || user.isDemo) return null;
  return (
    <div className="aero-infobar flex shrink-0 items-center gap-3 px-4 py-2 text-sm text-fg">
      <MailWarning className="size-4 text-accent-text" />
      <span className="min-w-0 flex-1">{t('auth.verify.banner')}</span>
      <button
        type="button"
        disabled={sent}
        className="shrink-0 font-semibold text-accent-text hover:underline disabled:no-underline disabled:opacity-70"
        onClick={() =>
          void api
            .post('/api/auth/verify-email/resend')
            .then(() => {
              setSent(true);
              toast.success(t('auth.verify.resent'));
            })
            .catch((err: unknown) => toast.error(errorMessage(err)))
        }
      >
        {sent ? t('auth.verify.resent') : t('auth.verify.resend')}
      </button>
    </div>
  );
}
