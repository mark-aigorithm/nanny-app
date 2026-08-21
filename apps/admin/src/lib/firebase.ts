import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Same Firebase project as the mobile app (see apps/mobile/app.config.ts).
// Values are public client identifiers, overridable per environment.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyC3eB2qrs8KVEPu5ny8J9sBAPcLbvWnuL8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'nanny-now-d8518.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'nanny-now-d8518',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'nanny-now-d8518.firebasestorage.app',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firebaseStorage = getStorage(app);

// End-to-end tests run against the local Auth emulator so they can create and
// sign in as operators freely, with no shared live project and no network.
// Set only by the test tooling (apps/admin/e2e); when it is absent — every real
// build — nothing below runs and the bundle is unchanged.
const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
if (authEmulatorHost) {
  connectAuthEmulator(firebaseAuth, `http://${authEmulatorHost}`, { disableWarnings: true });

  // Firebase persists the browser session in indexedDB by default, but
  // Playwright's storageState only captures localStorage and cookies — so a
  // saved session would not survive into a spec and RequireAuth would bounce
  // every test to /login. Switching to localStorage persistence makes the
  // signed-in state something Playwright can actually carry.
  void setPersistence(firebaseAuth, browserLocalPersistence);
}
