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

const presenceSizes = {
  xs: 'size-2.5 -right-1 -bottom-1',
  sm: 'size-3 -right-1 -bottom-1',
  md: 'size-3.5 -right-1 -bottom-1',
  lg: 'size-4 -right-1 -bottom-1',
  xl: 'size-5 -right-1 -bottom-1',
  '2xl': 'size-6 -right-1 -bottom-1',
};

interface UserAvatarProps {
  name: string;
  src: string | null | undefined;
  size?: keyof typeof sizes;
  presence?: PresenceStatus;
  className?: string;
  /** Fades the picture (e.g. offline members) without fading the presence mark. */
  dimmed?: boolean;
  /**
   * Large pictures (profiles): mounted in a pearl frame that glows in the presence colour,
   * like a Messenger display picture.
   */
  framed?: boolean;
}

/**
 * A person's display picture: a rounded square behind glass (people are framed pictures,
 * communities are round bubbles). Lazy-loaded image, deterministic initials fallback.
 */
export function UserAvatar({ name, src, size = 'md', presence, className, dimmed, framed }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const hue = hueFor(name);
  const picture = (
    <span
      className={cn(
        'avatar-frame grid place-items-center overflow-hidden rounded-avatar font-semibold text-white select-none emboss',
        sizes[size],
        dimmed && 'opacity-55 transition-opacity group-hover:opacity-100',
      )}
      style={{
        background: `linear-gradient(160deg, oklch(0.74 0.1 ${hue}), oklch(0.5 0.11 ${(hue + 30) % 360}) 70%, oklch(0.42 0.1 ${(hue + 50) % 360}))`,
      }}
      aria-hidden
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {framed ? (
        <span className="avatar-mount rounded-avatar p-1" data-presence={presence}>
          {picture}
        </span>
      ) : (
        picture
      )}
      {presence && (
        <span
          className={cn(
            'absolute grid place-items-center rounded-full bg-elevated p-px shadow-sm',
            presenceSizes[size],
          )}
        >
          <PresenceIcon status={presence} className="size-full" />
        </span>
      )}
    </span>
  );
}
