import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { clearAdminToken, setAdminToken } from './api-client';
import { firebaseAuth } from './firebase';

type AuthState = {
  /** undefined while Firebase restores the session on page load. */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(
    () =>
      // Fires on sign-in, sign-out, and hourly token refresh — keeps the
      // token used by the API client current without manual refresh logic.
      onIdTokenChanged(firebaseAuth, (nextUser) => {
        if (nextUser) {
          void nextUser.getIdToken().then(setAdminToken);
        } else {
          clearAdminToken();
        }
        setUser(nextUser);
      }),
    [],
  );

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    setAdminToken(await credential.user.getIdToken());
  };

  const logout = () => signOut(firebaseAuth);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

/** Redirects to /login until a Firebase session exists. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return null; // session restore in progress — avoid flashing the login page
  }
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
