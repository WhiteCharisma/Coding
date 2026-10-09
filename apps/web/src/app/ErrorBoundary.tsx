import { Component, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';

/** Last-resort crash screen. Unsent messages stay in the persisted outbox. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <EmptyState
          className="glass rounded-3xl bg-overlay"
          icon={TriangleAlert}
          tone="danger"
          title={t('common.errors.crashedTitle')}
          body={t('common.errors.crashedBody')}
          actions={
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RotateCcw /> {t('common.errors.reload')}
            </Button>
          }
        />
      </div>
    );
  }
}
