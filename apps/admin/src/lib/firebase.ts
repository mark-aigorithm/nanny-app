import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Same Firebase project as the mobile app (see apps/mobile/app.config.ts).
// Values are public client identifiers, overridable per environment.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyC3eB2qrs8KVEPu5ny8J9sBAPcLbvWnuL8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'nanny-now-d8518.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'nanny-now-d8518',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
