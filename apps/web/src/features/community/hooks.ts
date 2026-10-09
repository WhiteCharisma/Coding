import type { CommunityDTO, MemberDTO, RoleDTO } from '@creator-network/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { useChat } from '../../stores/chat';

export function useCommunityMembers(communityId: string | null) {
  const query = useQuery({
    queryKey: ['community', communityId, 'members'],
    queryFn: () => api.get<{ members: MemberDTO[] }>(`/api/communities/${communityId}/members`).then((r) => r.members),
    enabled: !!communityId,
    staleTime: 60_000,
  });
  // Seed live presence from the member list; socket events keep it current afterwards.
  useEffect(() => {
    if (query.data)
      useChat.getState().mergePresence(Object.fromEntries(query.data.map((m) => [m.user.id, m.presence])));
  }, [query.data]);
  return query;
}

/** Colour of a member's highest coloured role (used for author names). */
export function useRoleColors(
  community: CommunityDTO | undefined,
  members: MemberDTO[] | undefined,
): (userId: string) => string | null {
  const colors = useMemo(() => {
    const map = new Map<string, string>();
    if (!community || !members) return map;
    const roles = new Map<string, RoleDTO>(community.roles.map((r) => [r.id, r]));
    for (const m of members) {
      let best: RoleDTO | null = null;
      for (const id of m.roleIds) {
        const r = roles.get(id);
        if (r?.color && (!best || r.position > best.position)) best = r;
      }
      if (best?.color) map.set(m.user.id, best.color);
    }
    return map;
  }, [community, members]);
  return useCallback((userId: string) => colors.get(userId) ?? null, [colors]);
}

export function hasCommunityPerm(c: CommunityDTO | undefined, bit: number): boolean {
  if (!c) return false;
  return (c.myPermissions & bit) === bit || (c.myPermissions & (1 << 14)) !== 0;
}
