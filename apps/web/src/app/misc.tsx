import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { t } from '../i18n';
import { LogoMark } from '../components/brand/Logo';
import { buttonVariants } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';

export function FullscreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center bg-app" role="status" aria-label={t('common.labels.loading')}>
      <div className="flex flex-col items-center gap-4 text-accent">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-main">
      <EmptyState
        icon={Compass}
        title={t('common.errors.notFoundTitle')}
        body={t('common.errors.notFoundBody')}
        actions={
          <Link to="/" className={buttonVariants({ variant: 'primary' })}>
            {t('common.errors.goHome')}
          </Link>
        }
      />
    </div>
  );
}
