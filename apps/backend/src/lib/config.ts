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
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  // Print every missing/invalid key so the dev knows exactly what to set.
  // eslint-disable-next-line no-console
  console.error('[config] Invalid environment:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration. See errors above.');
}

const raw = parsed.data;

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
  },
} as const;

export type Config = typeof config;
