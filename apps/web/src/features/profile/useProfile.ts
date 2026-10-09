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
  const h = hue ?? 40;
  return {
    background: `radial-gradient(120% 140% at 0% 0%, oklch(0.55 0.13 ${h}) 0%, transparent 55%), radial-gradient(90% 120% at 100% 100%, oklch(0.42 0.1 ${(h + 50) % 360}) 0%, transparent 60%), oklch(0.24 0.02 ${h})`,
  };
}
