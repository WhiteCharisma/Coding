import { useState, type ReactNode } from 'react';
import { errorMessage } from '../../lib/api';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Extra form fields (e.g. reason, password). */
  children?: ReactNode;
  onConfirm: () => Promise<unknown> | unknown;
  confirmDisabled?: boolean;
}

/** Confirmation dialog that shows server errors inline instead of closing. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  danger,
  children,
  onConfirm,
  confirmDisabled,
}: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent
        title={title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            {/* The default button breathes, as on Windows Vista (decorative; off with Calm motion). */}
            <span className={cn('default-pulse decor inline-flex rounded-md', (busy || confirmDisabled) && 'paused')}>
              <Button
                variant={danger ? 'danger' : 'primary'}
                loading={busy}
                disabled={confirmDisabled}
                onClick={() => void run()}
              >
                {confirmLabel}
              </Button>
            </span>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirmDisabled) void run();
          }}
          className="flex flex-col gap-4"
        >
          {body && <div className="text-ui text-fg-2">{body}</div>}
          {children}
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" hidden />
        </form>
      </DialogContent>
    </Dialog>
  );
}
