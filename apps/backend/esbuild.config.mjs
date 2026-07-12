// Bundles the API into dist/vercel-bundle.cjs. The committed api/index.js
// re-exports this bundle so Vercel detects the serverless function from the
// git source (the bundle itself stays gitignored under dist/).
// Prisma, its pg adapter, and firebase-admin stay external — they rely on
// generated/native files that Vercel's file tracer picks up from node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/vercel.ts'],
  outfile: 'dist/vercel-bundle.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  tsconfig: 'tsconfig.json',
  external: ['@prisma/client', '@prisma/adapter-pg', 'firebase-admin', 'pg'],
  logLevel: 'info',
});
