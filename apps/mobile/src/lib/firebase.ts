import Constants from 'expo-constants';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  projectId: Constants.expoConfig?.extra?.['firebaseProjectId'] as string,
  // Add remaining Firebase config keys via app.config.ts extras
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
