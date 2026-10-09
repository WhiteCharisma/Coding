import type { PresenceStatus } from '@creator-network/shared';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { hueFor, initials } from '../../lib/format';
import { PresenceIcon } from './Presence';

const sizes = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[11px]',
  md: 'size-9 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-16 text-xl',
  '2xl': 'size-24 text-3xl',
};

const presenceSizes = { xs: 'size-2.5 -right-0.5 -bottom-0.5', sm: 'size-3 -right-0.5 -bottom-0.5', md: 'size-3.5 -right-0.5 -bottom-0.5', lg: 'size-3.5 right-0 bottom-0', xl: 'size-5 right-0.5 bottom-0.5', '2xl': 'size-6 right-1 bottom-1' };

interface UserAvatarProps {
  name: string;
  src: string | null | undefined;
  size?: keyof typeof sizes;
  presence?: PresenceStatus;
  className?: string;
  square?: boolean;
}

/** Avatar with lazy-loaded image and a deterministic initials fallback. */
export function UserAvatar({ name, src, size = 'md', presence, className, square }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const hue = hueFor(name);
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn('grid place-items-center overflow-hidden font-semibold text-white/95 select-none', square ? 'rounded-xl' : 'rounded-full', sizes[size])}
        style={{ background: `linear-gradient(135deg, oklch(0.55 0.09 ${hue}), oklch(0.38 0.07 ${(hue + 40) % 360}))` }}
        aria-hidden
      >
        {src && !failed ? (
          <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} draggable={false} />
        ) : (
          initials(name)
        )}
      </span>
      {presence && (
        <span className={cn('absolute grid place-items-center rounded-full bg-sidebar p-[2px]', presenceSizes[size])}>
          <PresenceIcon status={presence} className="size-full" />
        </span>
      )}
    </span>
  );
}
