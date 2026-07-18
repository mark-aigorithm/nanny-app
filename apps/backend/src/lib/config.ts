import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from the backend package root, regardless of cwd.
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Firebase Admin credentials. In production these come from AWS Secrets
  // Manager; in dev they come from .env. The private key is stored with
  // literal `\n` sequences and must be unescaped before passing to the SDK.
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be an email'),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'FIREBASE_PRIVATE_KEY is required'),
  // Firebase Storage bucket that holds uploaded ID documents / photos. Used
  // server-side to delete rejected ID images. Defaults to the app's bucket.
  FIREBASE_STORAGE_BUCKET: z.string().min(1).default('nanny-now-d8518.firebasestorage.app'),

  // Paymob unified (intention) API — all optional; feature enabled only when complete.
  PAYMOB_SECRET_KEY: z.string().optional(),
  PAYMOB_PUBLIC_KEY: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),
  /** Comma-separated Paymob integration IDs, e.g. "4869470" or "123,456" */
  PAYMOB_PAYMENT_METHOD_IDS: z.string().optional(),
  /** e.g. https://accept.paymob.com — region-specific if Paymob gives a different host */
  PAYMOB_API_BASE_URL: z.string().optional(),
  /** Public origin of this API, e.g. https://api.example.com (no trailing slash). Used to build notification_url. */
  PUBLIC_API_URL: z.string().optional(),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  // Print every missing/invalid key so the dev knows exactly what to set.
  // eslint-disable-next-line no-console
  console.error('[config] Invalid environment:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See errors above.');
}

const raw = parsed.data;

function buildPaymobConfig():
  | { enabled: false }
  | {
      enabled: true;
      secretKey: string;
      publicKey: string;
      hmacSecret: string;
      paymentMethodIds: number[];
      apiBaseUrl: string;
      publicApiUrl: string;
    } {
  const secretKey = raw.PAYMOB_SECRET_KEY?.trim();
  const publicKey = raw.PAYMOB_PUBLIC_KEY?.trim();
  const hmacSecret = raw.PAYMOB_HMAC_SECRET?.trim();
  const idsRaw = raw.PAYMOB_PAYMENT_METHOD_IDS?.trim();
  const publicApiUrl = raw.PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '';

  if (!secretKey || !publicKey || !hmacSecret || !idsRaw || !publicApiUrl) {
    return { enabled: false };
  }

  const paymentMethodIds = idsRaw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (paymentMethodIds.length === 0) {
    return { enabled: false };
  }

  const apiBaseUrl = (raw.PAYMOB_API_BASE_URL?.trim().replace(/\/$/, '') || 'https://accept.paymob.com');

  return {
    enabled: true,
    secretKey,
    publicKey,
    hmacSecret,
    paymentMethodIds,
    apiBaseUrl,
    publicApiUrl,
  };
}

export const config = {
  nodeEnv: raw.NODE_ENV,
  port: raw.PORT,
  databaseUrl: raw.DATABASE_URL,
  firebase: {
    projectId: raw.FIREBASE_PROJECT_ID,
    clientEmail: raw.FIREBASE_CLIENT_EMAIL,
    // Convert literal `\n` sequences (as stored in .env / Secrets Manager)
    // into real newlines for the Firebase SDK.
    privateKey: raw.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    storageBucket: raw.FIREBASE_STORAGE_BUCKET,
  },
  paymob: buildPaymobConfig(),
} as const;

export type Config = typeof config;
