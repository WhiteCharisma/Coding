import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ui/confirm';
import { toast } from '../../components/ui/toast';
import { t } from '../../i18n';
import { errorMessage } from '../../lib/api';
import { usePendingCount } from '../../stores/messages';
import { useSession } from '../../stores/session';

/**
 * Sign-out action shared by the user menu and the settings page. Signing out deletes unsent
 * messages from this device, so it asks first when there are any. Render `dialog` outside
 * any menu (menus unmount their content when they close).
 */
export function useSignOut() {
  const navigate = useNavigate();
  const pending = usePendingCount();
  const [confirming, setConfirming] = useState(false);
  const signOutNow = async () => {
    await useSession.getState().logout();
    void navigate('/welcome', { replace: true });
  };
  const signOut = () => {
    if (pending > 0) setConfirming(true);
    // Fails while offline: the server session would stay valid, so the user stays signed in.
    else signOutNow().catch((err: unknown) => toast.error(errorMessage(err)));
  };
  const dialog = (
    <ConfirmDialog
      open={confirming}
      onOpenChange={setConfirming}
      title={t('shell.signOutUnsent.title')}
      body={t('shell.signOutUnsent.body', { count: pending })}
      confirmLabel={t('shell.userMenu.signOut')}
      danger
      onConfirm={signOutNow}
    />
  );
  return { signOut, dialog };
}
