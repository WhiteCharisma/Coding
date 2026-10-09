import { REPORT_REASONS, type ReportReason } from '@creator-network/shared';
import { useState } from 'react';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Field, Textarea } from '../../components/ui/input';
import { toast } from '../../components/ui/toast';

export interface ReportTarget {
  type: 'message' | 'user' | 'community';
  id: string;
  label: string;
}

export function ReportDialog({ open, onOpenChange, target }: { open: boolean; onOpenChange: (o: boolean) => void; target: ReportTarget }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/reports', { targetType: target.type, targetId: target.id, reason, details });
      toast.success(t('report.sent'));
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('report.title', { target: target.label })}
        description={t('report.privacy')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button variant="danger" loading={busy} disabled={!reason} onClick={() => void submit()}>
              {t('report.submit')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-fg-2">{t('report.reason')}</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {REPORT_REASONS.map((r) => (
                <label key={r} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors', reason === r ? 'border-danger/60 bg-danger-soft text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--danger)]" />
                  {t(`report.reasons.${r}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t('report.details')} optional={t('common.labels.optional')}>
            {(p) => <Textarea {...p} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('report.detailsPlaceholder')} maxLength={1000} rows={3} />}
          </Field>
          {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
