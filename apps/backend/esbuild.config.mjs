// Bundles the API into dist/vercel-bundle.cjs. The committed api/index.js
// re-exports this bundle so Vercel detects the serverless function from the
// git source (the bundle itself stays gitignored under dist/).
// Prisma, its pg adapter, and firebase-admin stay external — they rely on
// generated/native files that Vercel's file tracer picks up from node_modules.
import { cpSync } from 'node:fs';

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

// The email renderer reads its HTML templates from `__dirname/templates`.
// Bundling flattens the whole app into dist/vercel-bundle.cjs, so that
// __dirname is dist/ — not dist/lib/email/, which is where scripts/copy-assets.mjs
// puts them for the tsc build. That script also never runs on Vercel: the
// project's build command is `pnpm db:generate && node esbuild.config.mjs`, not
// `pnpm build`. So the bundle has to ship its own copy, at its own path.
//
// vercel.json's functions.includeFiles is what gets these into the deployed
// function — the loader reads them with a computed filename, which the file
// tracer cannot follow.
cpSync('src/lib/email/templates', 'dist/templates', { recursive: true });
console.log('[esbuild] src/lib/email/templates -> dist/templates');
