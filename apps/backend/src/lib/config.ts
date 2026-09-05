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

  // Transactional email — all optional; feature enabled only when a full
  // transport is configured (see buildEmailConfig). Two ways to configure it:
  //  1. Generic SMTP: SMTP_HOST (+ port/user/password/from).
  //  2. Gmail shortcut: GMAIL_USER + GMAIL_APP_PASSWORD — host/port/TLS are
  //     fixed for Gmail, so those two are enough.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  /** "true" forces an implicit-TLS connection; otherwise inferred from the port (465 ⇒ true). */
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** A Gmail address used as the SMTP account (and default From). */
  GMAIL_USER: z.string().optional(),
  /** A Gmail App Password (not the account password). 16 chars, spaces optional. */
  GMAIL_APP_PASSWORD: z.string().optional(),
  /** Envelope From, e.g. "NannyApp <no-reply@nannyapp.com>". Defaults to GMAIL_USER when using the Gmail shortcut. */
  EMAIL_FROM: z.string().optional(),

  // The manual release-test checklist behind the console's public /qa page.
  // Off unless explicitly turned on: its endpoints are unauthenticated by
  // design, so an environment that is not running a release test should not
  // expose them at all. Set to "true" for the duration of the test round.
  QA_CHECKLIST_ENABLED: z
    .string()
    .optional()
    .transform((v) => v?.trim().toLowerCase() === 'true'),
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

function buildEmailConfig():
  | { enabled: false }
  | {
      enabled: true;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      from: string;
    } {
  const from = raw.EMAIL_FROM?.trim();

  // 1. Generic SMTP takes precedence when a host is given.
  const host = raw.SMTP_HOST?.trim();
  if (host) {
    const user = raw.SMTP_USER?.trim();
    const pass = raw.SMTP_PASSWORD?.trim();
    const port = raw.SMTP_PORT;
    // A no-op until every piece is present, so an unconfigured environment
    // silently skips sending rather than crashing at startup.
    if (!user || !pass || !from || !port) {
      return { enabled: false };
    }
    // Explicit SMTP_SECURE wins; otherwise implicit TLS is the standard for 465.
    const secure =
      raw.SMTP_SECURE?.trim() ? raw.SMTP_SECURE.trim().toLowerCase() === 'true' : port === 465;
    return { enabled: true, host, port, secure, user, pass, from };
  }

  // 2. Gmail shortcut: the account + App Password is all that's needed — Gmail's
  // host, port and implicit TLS are fixed. From defaults to the Gmail address.
  const gmailUser = raw.GMAIL_USER?.trim();
  const gmailPass = raw.GMAIL_APP_PASSWORD?.trim().replace(/\s+/g, '');
  if (gmailUser && gmailPass) {
    return {
      enabled: true,
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: gmailUser,
      pass: gmailPass,
      from: from || `NannyApp <${gmailUser}>`,
    };
  }

  return { enabled: false };
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
  email: buildEmailConfig(),
  qaChecklistEnabled: raw.QA_CHECKLIST_ENABLED,
} as const;

export type Config = typeof config;
