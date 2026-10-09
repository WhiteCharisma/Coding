import { useState } from 'react';
import { cn } from '../../lib/cn';
import { hueFor, initials } from '../../lib/format';

// Communities are glossy bubbles (people are framed squares, see UserAvatar).
const sizes = {
  xs: 'size-5 text-[9px]',
  sm: 'size-8 text-xs',
  md: 'size-12 text-base',
  lg: 'size-16 text-xl',
  xl: 'size-20 text-2xl',
};

export function CommunityIcon({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src: string | null | undefined;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={cn(
        'gloss grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-semibold text-white select-none emboss',
        sizes[size],
        className,
      )}
      style={{
        background: `radial-gradient(circle at 35% 28%, oklch(0.78 0.11 ${hue}), oklch(0.5 0.13 ${(hue + 30) % 360}) 70%, oklch(0.4 0.12 ${(hue + 50) % 360}))`,
      }}
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
}
