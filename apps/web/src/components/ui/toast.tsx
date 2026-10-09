import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { create } from 'zustand';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { playSound } from '../../lib/sounds';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
  leaving?: boolean;
}

interface ToastState {
  items: ToastItem[];
  push: (item: Omit<ToastItem, 'id'>, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (item, durationMs = 4500) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-3), { ...item, id }] }));
    window.setTimeout(() => get().dismiss(id), durationMs);
  },
  dismiss: (id) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, leaving: true } : i)) }));
    window.setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 180);
  },
}));

export const toast = {
  success: (message: string, action?: ToastItem['action']) => {
    playSound('success');
    return useToasts.getState().push({ tone: 'success', message, action });
  },
  error: (message: string, action?: ToastItem['action']) =>
    useToasts.getState().push({ tone: 'error', message, action }, 6500),
  info: (message: string, action?: ToastItem['action']) => useToasts.getState().push({ tone: 'info', message, action }),
};

const icons = { success: CircleCheck, error: CircleAlert, info: Info };

export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--mobile-nav-height)+12px)] z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 md:right-3 md:bottom-[calc(var(--taskbar-height)+14px)] md:left-auto md:items-end md:px-0"
    >
      {items.map((item) => {
        const Icon = icons[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            // Balloon tips rise from the notification area, as on Windows.
            className={cn(
              'balloon pointer-events-auto flex w-full max-w-sm origin-bottom-right items-start gap-3 px-3.5 py-3 text-ui',
              item.leaving ? 'animate-pop-out' : 'animate-[balloon-in_340ms_var(--ease-spring)_both]',
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 size-4',
                item.tone === 'success' ? 'text-success' : item.tone === 'error' ? 'text-danger' : 'text-info',
              )}
            />
            <p className="min-w-0 flex-1 leading-snug">{item.message}</p>
            {item.action && (
              <button
                type="button"
                className="shrink-0 text-sm font-semibold text-accent-text hover:underline"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={t('common.actions.close')}
              className="-mr-1 rounded p-0.5 text-fg-muted hover:text-fg"
              onClick={() => dismiss(item.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
