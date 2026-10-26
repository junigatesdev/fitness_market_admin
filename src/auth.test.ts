import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('./supabase', () => ({ supabase: { auth: sb } }));

import { restoreSession, signIn, signOut } from './auth';

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  sb.signOut.mockResolvedValue({});
  sb.getSession.mockResolvedValue({ data: { session: null } });
});

describe('temporary abc login', () => {
  it('opens a local session without contacting Supabase', async () => {
    expect(await signIn('abc', 'abc')).toBe('abc');
    expect(sb.signInWithPassword).not.toHaveBeenCalled();
    expect(await restoreSession()).toBe('abc');
  });

  it('is cleared by sign out', async () => {
    await signIn('abc', 'abc');
    await signOut();
    expect(await restoreSession()).toBeNull();
  });

  it('a wrong password for abc goes to Supabase and fails', async () => {
    sb.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    await expect(signIn('abc', 'nope')).rejects.toThrow('Wrong email or password.');
  });
});
