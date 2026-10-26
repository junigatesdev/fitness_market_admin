import { useEffect, useState } from 'react';
import { onSignedOut, restoreSession, signIn, signOut } from './auth';
import { Dashboard } from './Dashboard';
import { LoginPage } from './LoginPage';

export function App() {
  // undefined = still checking for an existing session
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    restoreSession().then((email) => active && setUser(email));
    const stop = onSignedOut(() => setUser(null));
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (user === undefined) return <p className="loading">Loading…</p>;

  if (!user) {
    return <LoginPage onLogin={async (email, password) => setUser(await signIn(email, password))} />;
  }

  return (
    <Dashboard
      username={user}
      onSignOut={() => {
        setUser(null);
        void signOut();
      }}
    />
  );
}
