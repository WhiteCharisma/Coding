import { ArrowLeft, ArrowRight, ChevronRight, Copy, Minus, Search, Square, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { playSound } from '../../lib/sounds';
import { useDesktop } from '../../stores/desktop';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu';
import { Tooltip } from '../../components/ui/tooltip';
import { useIsDesktop } from './hooks';
import { useWindowPlace, type Crumb, type WindowPlace } from './place';

/**
 * Back/forward availability. React Router keeps the position in the session history
 * (history.state.idx); the furthest position reached is remembered for "forward".
 */
function useHistoryButtons(): { canBack: boolean; canForward: boolean } {
  const location = useLocation();
  const type = useNavigationType();
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const [seen, setSeen] = useState({ key: location.key, idx, furthest: idx });
  if (seen.key !== location.key) {
    // A new page (push) cuts off the pages that were ahead; going back keeps them.
    setSeen({ key: location.key, idx, furthest: type === 'PUSH' ? idx : Math.max(seen.furthest, idx) });
  }
  return { canBack: idx > 0, canForward: idx < Math.max(seen.furthest, idx) };
}

function CaptionButtons() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const maximized = useDesktop((s) => s.maximized);
  const desktop = useDesktop.getState();
  const atHome = pathname === '/home';
  return (
    <div className="caption-buttons" data-testid="window-caption">
      <Tooltip content={t('shell.window.minimize')} side="bottom">
        <button
          type="button"
          className="caption-btn"
          aria-label={t('shell.window.minimize')}
          onClick={() => desktop.setMinimized(true)}
        >
          <Minus />
        </button>
      </Tooltip>
      <Tooltip content={maximized ? t('shell.window.restore') : t('shell.window.maximize')} side="bottom">
        <button
          type="button"
          className="caption-btn"
          aria-label={maximized ? t('shell.window.restore') : t('shell.window.maximize')}
          aria-pressed={maximized}
          onClick={desktop.toggleMaximized}
        >
          {maximized ? <Copy /> : <Square />}
        </button>
      </Tooltip>
      <Tooltip content={atHome ? t('shell.window.closeHome') : t('shell.window.closeHint')} side="bottom">
        <button
          type="button"
          className="caption-btn caption-close"
          aria-label={t('shell.window.close')}
          disabled={atHome}
          onClick={() => void navigate('/home')}
        >
          <X />
        </button>
      </Tooltip>
    </div>
  );
}

function CrumbSegment({ crumb, last }: { crumb: Crumb; last: boolean }) {
  const navigate = useNavigate();
  const label = (
    <>
      {crumb.icon}
      <span className={cn('truncate', crumb.icon && !last && crumb.to === '/home' && 'sr-only')}>{crumb.label}</span>
    </>
  );
  return (
    <>
      {crumb.to && !last ? (
        <Link to={crumb.to} className="crumb">
          {label}
        </Link>
      ) : (
        <span className="crumb" aria-current={last ? 'location' : undefined}>
          {label}
        </span>
      )}
      {crumb.children && crumb.children.length > 0 && (
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="crumb-arrow"
              aria-label={t('shell.window.placesIn', { place: crumb.label })}
            >
              <ChevronRight />
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="max-h-[60vh] overflow-y-auto">
            {crumb.children.map((c) => (
              <MenuItem
                key={c.to}
                onSelect={() => void navigate(c.to)}
                className={cn(c.current && 'font-semibold text-fg')}
              >
                {c.icon}
                <span className="truncate">{c.label}</span>
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
    </>
  );
}

function SearchField({ place }: { place: WindowPlace }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    void navigate(place.searchTo(q));
    setQuery('');
  };
  return (
    <form role="search" onSubmit={submit} className="glass-field w-60 shrink-0 pr-1.5 pl-2 max-lg:w-44">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={place.searchLabel}
        placeholder={place.searchLabel}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted placeholder:italic focus:outline-none focus-visible:shadow-none"
      />
      <button type="submit" aria-label={t('shell.nav.search')} className="grid size-5 place-items-center text-fg-muted">
        <Search className="size-3.5" />
      </button>
    </form>
  );
}

function AddressBar({ place }: { place: WindowPlace }) {
  const navigate = useNavigate();
  const { canBack, canForward } = useHistoryButtons();
  return (
    <div className="aero-addressbar" data-testid="address-bar">
      <Tooltip content={t('shell.window.back')} side="bottom">
        <button
          type="button"
          className="nav-orb"
          aria-label={t('shell.window.back')}
          disabled={!canBack}
          onClick={() => void navigate(-1)}
        >
          <ArrowLeft />
        </button>
      </Tooltip>
      <Tooltip content={t('shell.window.forward')} side="bottom">
        <button
          type="button"
          className="nav-orb -ml-1"
          aria-label={t('shell.window.forward')}
          disabled={!canForward}
          onClick={() => void navigate(1)}
        >
          <ArrowRight />
        </button>
      </Tooltip>
      <nav aria-label={t('shell.window.location')} className="glass-field min-w-0 flex-1 gap-px overflow-hidden px-0.5">
        {place.crumbs.map((c, i) => (
          <CrumbSegment key={`${c.label}-${i}`} crumb={c} last={i === place.crumbs.length - 1} />
        ))}
      </nav>
      <SearchField place={place} />
    </div>
  );
}

type WindowAnim = 'open' | 'restore' | 'maximize';

/**
 * The main window: Aero glass frame (title, caption buttons, address bar) around an opaque
 * content area. On phones only the content is shown (styles/vista.css).
 */
export function AeroWindow({ children }: { children: ReactNode }) {
  const place = useWindowPlace();
  const maximized = useDesktop((s) => s.maximized);
  const desktop = useIsDesktop();
  // Minimising is a desktop thing: on a phone the window is the whole screen.
  const minimized = useDesktop((s) => s.minimized) && desktop;
  const { pathname } = useLocation();
  const [anim, setAnim] = useState<WindowAnim | null>(() => (desktop ? 'open' : null));
  const previous = useRef({ maximized, minimized });

  // Any navigation brings a minimised window back.
  useEffect(() => {
    if (useDesktop.getState().minimized) useDesktop.getState().setMinimized(false);
  }, [pathname]);

  useEffect(() => {
    const was = previous.current;
    previous.current = { maximized, minimized };
    if (was.minimized && !minimized) {
      setAnim('restore');
      playSound('open');
    } else if (was.maximized !== maximized) {
      setAnim('maximize');
    }
  }, [maximized, minimized]);

  return (
    <section
      aria-label={place.title}
      className="aero-window flex-1"
      data-maximized={maximized || undefined}
      data-minimized={minimized || undefined}
      data-anim={anim ?? undefined}
      data-testid="app-window"
      inert={minimized || undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setAnim(null);
      }}
    >
      <div aria-hidden className="aero-frame aero-frame-top aero-glass" />
      <div aria-hidden className="aero-frame aero-frame-left aero-glass" />
      <div aria-hidden className="aero-frame aero-frame-right aero-glass" />
      <div aria-hidden className="aero-frame aero-frame-bottom aero-glass" />
      <div aria-hidden className="aero-shine" />
      <div className="aero-titlebar" onDoubleClick={() => useDesktop.getState().toggleMaximized()}>
        <span className="grid size-5 shrink-0 place-items-center">{place.icon}</span>
        <p className="aero-title glass-text">{place.title}</p>
      </div>
      <CaptionButtons />
      <AddressBar place={place} />
      <div className="aero-client">{children}</div>
    </section>
  );
}
