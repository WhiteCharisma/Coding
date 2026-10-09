import { REACTION_EMOJI } from '@creator-network/shared';
import type { ReactNode } from 'react';
import { t } from '../../i18n';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';

export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div role="group" aria-label={t('chat.emoji.title')} className="grid grid-cols-8 gap-0.5">
      {REACTION_EMOJI.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={e}
          onClick={() => onPick(e)}
          className="grid size-9 place-items-center rounded-md text-xl transition-transform duration-[var(--dur-fast)] hover:scale-110 hover:bg-hover focus-visible:bg-hover"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ onPick, children, open, onOpenChange }: { onPick: (emoji: string) => void; children: ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto p-2">
        <p className="px-1 pb-1.5 text-2xs font-semibold tracking-wide text-fg-muted uppercase">{t('chat.emoji.frequently')}</p>
        <EmojiGrid onPick={onPick} />
      </PopoverContent>
    </Popover>
  );
}
