import { useState } from 'react';
import { cn } from '../../lib/cn';
import { hueFor, initials } from '../../lib/format';

const sizes = {
  sm: 'size-8 text-xs rounded-lg',
  md: 'size-12 text-base rounded-2xl',
  lg: 'size-16 text-xl rounded-2xl',
  xl: 'size-20 text-2xl rounded-3xl',
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
        'grid shrink-0 place-items-center overflow-hidden font-display font-semibold text-white/95 select-none',
        sizes[size],
        className,
      )}
      style={{ background: `linear-gradient(145deg, oklch(0.5 0.1 ${hue}), oklch(0.32 0.06 ${(hue + 50) % 360}))` }}
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
