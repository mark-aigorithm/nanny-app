import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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
