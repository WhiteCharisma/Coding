import { useLayoutEffect, useRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type PaneTag = 'section' | 'aside' | 'main' | 'nav' | 'div';

type GlassPaneProps<T extends PaneTag> = {
  as?: T;
  /** The colour of the content below the glass header (the conversation is the lightest). */
  surface?: 'main' | 'side';
  /** A light sweeps across the glass header whenever this changes (a new channel, a new page). */
  shine?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'children'>;

/**
 * A part of the chat (channel list, conversation, members, a page) as a small Aero window: a
 * strip of real glass along the top where its header sits, a glass frame around it, and an
 * opaque content area below so long reading stays calm.
 *
 * The glass is four separate strips behind the content, never an ancestor of it: a backdrop
 * blur is redrawn whenever its element changes, and this way scrolling the content does not
 * touch the glass (docs/DESIGN.md → Aero Glass). The first child is the header: it sits on the
 * glass (`.pane-head` gives it the height and the glowing text). On phones the pane is the
 * whole screen, without glass.
 */
export function GlassPane<T extends PaneTag = 'section'>({
  as,
  surface = 'side',
  shine,
  className,
  children,
  ...rest
}: GlassPaneProps<T>) {
  const Tag = (as ?? 'section') as PaneTag;
  return (
    <Tag className={cn('glass-pane', surface === 'main' && 'glass-pane-main', className)} {...rest}>
      <span aria-hidden className="pane-frame pane-frame-top aero-glass" />
      <span aria-hidden className="pane-frame pane-frame-left aero-glass" />
      <span aria-hidden className="pane-frame pane-frame-right aero-glass" />
      <span aria-hidden className="pane-frame pane-frame-bottom aero-glass" />
      {shine !== undefined && <span key={shine} aria-hidden className="pane-shine" />}
      {children}
    </Tag>
  );
}

/**
 * The bottom of a pane on the glass, like the message box of a Windows Live Messenger
 * conversation: the pane's opaque surface stops above it, and a strip of glass of its exact
 * height sits behind it (never behind the scrolling messages). Its height is measured because
 * the composer grows with what you type; text in it marked `on-glass` gets the glass colours.
 */
export function PaneFoot({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const foot = ref.current;
    const pane = foot?.closest<HTMLElement>('.glass-pane');
    if (!foot || !pane || typeof ResizeObserver === 'undefined') return;
    // --pane-foot is registered as not inherited (styles/vista.css): only the pane restyles.
    const observer = new ResizeObserver(() => pane.style.setProperty('--pane-foot', `${foot.offsetHeight}px`));
    observer.observe(foot);
    return () => {
      observer.disconnect();
      pane.style.removeProperty('--pane-foot');
    };
  }, []);
  return (
    <div ref={ref} className={cn('pane-foot', className)}>
      <span aria-hidden className="pane-foot-glass aero-glass" />
      {children}
    </div>
  );
}
