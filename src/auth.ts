// TEMPORARY placeholder sign-in. These credentials ship in the public JavaScript bundle, so this is
// NOT security. Replace `signIn` with real authentication before any real data is connected.
const TEMP_USERNAME = 'abc';
const TEMP_PASSWORD = 'abc';
const SESSION_KEY = 'fm-admin-session';

export async function signIn(username: string, password: string): Promise<void> {
  if (username.trim() !== TEMP_USERNAME || password !== TEMP_PASSWORD) {
    throw new Error('Wrong username or password.');
  }
  try {
    sessionStorage.setItem(SESSION_KEY, username.trim());
  } catch {
    /* storage unavailable: the session just won't survive a refresh */
  }
}

export function currentUser(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
