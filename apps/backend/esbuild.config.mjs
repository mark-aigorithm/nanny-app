// Bundles the API into a single Vercel serverless function at api/index.js.
// Prisma, its pg adapter, and firebase-admin stay external — they rely on
// generated/native files that Vercel's file tracer picks up from node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/vercel.ts'],
  outfile: 'api/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: ['@prisma/client', '@prisma/adapter-pg', 'firebase-admin', 'pg'],
  logLevel: 'info',
});
