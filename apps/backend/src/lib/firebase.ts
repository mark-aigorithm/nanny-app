import admin from 'firebase-admin';

import { config } from './config';

/**
 * The Auth emulator issues unsigned tokens and verifies them by project id
 * alone, so no service-account key is involved. That matters because
 * `admin.credential.cert()` parses the private key as a PEM *eagerly* — it
 * rejects a placeholder with "Failed to parse private key" — which would force
 * a real RSA key into the repo just to run tests. Initialising without a
 * credential when `FIREBASE_AUTH_EMULATOR_HOST` is set avoids that entirely.
 *
 * Set by test tooling only. When it is absent — every real environment —
 * initialisation is unchanged.
 */
const usingAuthEmulator = Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST']);

// Singleton-init the Firebase Admin SDK so we don't double-initialize on
// hot reloads in dev (ts-node-dev re-evaluates this module).
if (!admin.apps.length) {
  admin.initializeApp({
    ...(usingAuthEmulator
      ? {}
      : {
          credential: admin.credential.cert({
            projectId: config.firebase.projectId,
            clientEmail: config.firebase.clientEmail,
            privateKey: config.firebase.privateKey,
          }),
        }),
    projectId: config.firebase.projectId,
    storageBucket: config.firebase.storageBucket,
  });
}

export const firebaseAuth = admin.auth();
export const firebaseMessaging = admin.messaging();
export const firebaseStorage = admin.storage();
export type DecodedIdToken = admin.auth.DecodedIdToken;
