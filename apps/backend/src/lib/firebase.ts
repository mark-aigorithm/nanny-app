import admin from 'firebase-admin';

import { config } from './config';

// Singleton-init the Firebase Admin SDK so we don't double-initialize on
// hot reloads in dev (ts-node-dev re-evaluates this module).
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
    storageBucket: config.firebase.storageBucket,
  });
}

export const firebaseAuth = admin.auth();
export const firebaseMessaging = admin.messaging();
export const firebaseStorage = admin.storage();
export type DecodedIdToken = admin.auth.DecodedIdToken;
