import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { onUnauthorized } from '../lib/api';
import { setNavigator } from '../lib/navigator';
import { useSession } from '../stores/session';
import { applyTheme, useUi } from '../stores/ui';
import { FullscreenSpinner } from './misc';

/** Loads the session once, keeps the theme in sync and tears everything down on sign-out. */
export function SessionBoot() {
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    void useSession.getState().init();
    return onUnauthorized(() => useSession.getState().signedOut('expired'));
  }, []);

  useEffect(() => {
    setNavigator((to) => void navigate(to));
  }, [navigate]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const listener = () => applyTheme('system');
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  // After signing out (or the session ending), drop everything the signed-in app loaded.
  const previous = useRef(status);
  useEffect(() => {
    if (status === 'anonymous' && previous.current === 'authenticated') {
      void import('./teardown').then((m) => m.teardownSession());
    }
    previous.current = status;
  }, [status]);
  return null;
}

/** Pages for signed-out visitors; signed-in users are sent into the app. */
export function PublicOnly() {
  const status = useSession((s) => s.status);
  const location = useLocation();
  // Once the page has been shown to a signed-out visitor, signing in on it (login, register)
  // is handled by that page's own navigation — redirecting here as well would race with it.
  const [shownAnonymous, setShownAnonymous] = useState(false);
  if (status === 'anonymous' && !shownAnonymous) setShownAnonymous(true);
  if (status === 'loading') return <FullscreenSpinner />;
  if (status === 'authenticated' && !shownAnonymous) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/home'} replace />;
  }
  return <Outlet />;
}
