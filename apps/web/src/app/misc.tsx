import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { t } from '../i18n';
import { LogoMark } from '../components/brand/Logo';
import { SkyArt } from '../components/brand/SkyArt';
import { buttonVariants } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';

export function FullscreenSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label={t('common.labels.loading')}>
      <div className="flex flex-col items-center gap-4 text-accent">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="relative grid min-h-dvh place-items-center p-4">
      <SkyArt />
      <EmptyState
        className="glass relative rounded-3xl bg-overlay"
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
