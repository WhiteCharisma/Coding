import type { PublicConfig, SelfUser } from '@creator-network/shared';
import { create } from 'zustand';
import { api } from '../lib/api';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface SessionState {
  status: Status;
  user: SelfUser | null;
  config: PublicConfig | null;
  /** Set when the server ended the session (revoked/expired) so the login page can explain why. */
  endedReason: 'expired' | null;
  init: () => Promise<void>;
  setUser: (user: SelfUser) => void;
  setConfig: (config: PublicConfig) => void;
  signedOut: (reason?: 'expired') => void;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  user: null,
  config: null,
  endedReason: null,
  async init() {
    const [config, session] = await Promise.allSettled([
      api.get<PublicConfig>('/api/config'),
      api.get<{ user: SelfUser | null }>('/api/auth/state'),
    ]);
    if (config.status === 'fulfilled') set({ config: config.value });
    if (session.status === 'fulfilled' && session.value.user)
      set({ user: session.value.user, status: 'authenticated' });
    else set({ status: 'anonymous', user: null });
  },
  setUser: (user) => set({ user, status: 'authenticated', endedReason: null }),
  setConfig: (config) => set({ config }),
  signedOut: (reason) => {
    if (get().status === 'anonymous') return;
    set({ status: 'anonymous', user: null, endedReason: reason ?? null });
  },
  async logout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      set({ status: 'anonymous', user: null, endedReason: null });
    }
  },
}));

export const useUser = () => useSession((s) => s.user);
export const useConfig = () => useSession((s) => s.config);
