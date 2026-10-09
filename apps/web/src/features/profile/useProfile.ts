import type { UserProfile } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function useProfile(username: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.get<{ profile: UserProfile }>(`/api/users/${username}`).then((r) => r.profile),
    enabled: !!username && enabled,
    staleTime: 60_000,
  });
}

/** Banner gradient derived from the user's chosen hue (or a neutral default). */
export function bannerStyle(hue: number | null): React.CSSProperties {
  // A luminous sky in the person's colour: glossy upper half, a soft sun, a deeper horizon.
  const h = hue ?? 215;
  return {
    background: [
      'linear-gradient(180deg, oklch(1 0 0 / 0.3), oklch(1 0 0 / 0.08) 46%, transparent 62%)',
      `radial-gradient(45% 110% at 88% 0%, oklch(0.97 0.06 ${(h + 60) % 360} / 0.9), transparent 70%)`,
      `radial-gradient(90% 120% at 0% 100%, oklch(0.5 0.14 ${(h + 20) % 360} / 0.85), transparent 65%)`,
      `linear-gradient(165deg, oklch(0.6 0.15 ${h}), oklch(0.76 0.11 ${(h + 30) % 360}) 55%, oklch(0.86 0.07 ${(h + 50) % 360}))`,
    ].join(', '),
  };
}
