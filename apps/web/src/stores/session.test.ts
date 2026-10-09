import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { selfUser } from '../test/factories';

const post = vi.fn<(path: string) => Promise<unknown>>();
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: { post: (path: string) => post(path) },
}));

const { useSession } = await import('./session');

beforeEach(() => {
  post.mockReset();
  useSession.getState().setUser(selfUser());
});

describe('logout', () => {
  it('signs out when the server confirms', async () => {
    post.mockResolvedValue(undefined);
    await useSession.getState().logout();
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().endedReason).toBeNull();
  });

  it('treats an already-ended session as signed out', async () => {
    post.mockRejectedValue(new ApiError(401, 'unauthorized', 'Sign in to continue.'));
    await useSession.getState().logout();
    expect(useSession.getState().status).toBe('anonymous');
  });

  it('stays signed in when the server cannot be reached (its session is still valid)', async () => {
    post.mockRejectedValue(new ApiError(0, 'network', 'Could not reach the server.'));
    await expect(useSession.getState().logout()).rejects.toThrow('Could not reach the server.');
    expect(useSession.getState().status).toBe('authenticated');
  });
});
