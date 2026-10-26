import { supabase } from './supabase';

/** Signed in AND listed in public.admins. Any other account is signed straight back out. */
async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Resolves to the signed-in admin's email. Rejects with a message that is safe to show. */
export async function signIn(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(
      error?.message === 'Invalid login credentials' ? 'Wrong email or password.' : 'Could not sign in. Try again.',
    );
  }
  try {
    if (!(await isAdmin(data.user.id))) {
      await supabase.auth.signOut();
      throw new Error('This account is not an admin.');
    }
  } catch (e) {
    await supabase.auth.signOut();
    throw e instanceof Error && e.message === 'This account is not an admin.'
      ? e
      : new Error('Could not check admin access. Try again.');
  }
  return data.user.email ?? email;
}

/** The admin's email if a valid admin session already exists (e.g. after a page reload), else null. */
export async function restoreSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  try {
    if (await isAdmin(user.id)) return user.email ?? null;
  } catch {
    /* fall through: treat as signed out */
  }
  await supabase.auth.signOut();
  return null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Calls back when the session ends (sign-out here, in another tab, or an expired refresh token). */
export function onSignedOut(callback: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
  return () => data.subscription.unsubscribe();
}
