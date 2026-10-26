import { useState } from 'react';
import { currentUser, signIn, signOut } from './auth';
import { Dashboard } from './Dashboard';
import { LoginPage } from './LoginPage';

export function App() {
  const [user, setUser] = useState<string | null>(currentUser);

  if (!user) {
    return (
      <LoginPage
        onLogin={async (username, password) => {
          await signIn(username, password);
          setUser(username);
        }}
      />
    );
  }

  return (
    <Dashboard
      username={user}
      onSignOut={() => {
        signOut();
        setUser(null);
      }}
    />
  );
}
