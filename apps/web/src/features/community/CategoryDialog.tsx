import type { CategoryDTO, CommunityDTO } from '@creator-network/shared';
import { useState, type FormEvent } from 'react';
import { t } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { Field, Input } from '../../components/ui/input';

export function CategoryDialog({
  community,
  category,
  open,
  onOpenChange,
}: {
  community: CommunityDTO;
  category?: CategoryDTO;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (category) await api.patch(`/api/categories/${category.id}`, { name });
      else await api.post(`/api/communities/${community.id}/categories`, { name });
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
        title={category ? t('common.actions.edit') : t('community.settings.channels.newCategory')}
        size="sm"
      >
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <Field label={t('community.settings.channels.newCategory')} error={error ?? undefined}>
            {(p) => (
              <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus required />
            )}
          </Field>
          <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
            {t('common.actions.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
