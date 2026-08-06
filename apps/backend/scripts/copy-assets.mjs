// Copy non-TypeScript runtime assets into dist after `tsc`.
//
// `tsc` only emits .js/.d.ts, so the email HTML templates under
// src/lib/email/templates would be missing from the compiled output and the
// renderer's fs.readFileSync would fail in production. Mirror the templates
// tree into dist so __dirname-relative loading works both under ts-jest/ts-node
// (src) and from the built server (dist). Uses only Node's fs, so it runs the
// same on Windows and Linux/CI.
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const assets = [['src/lib/email/templates', 'dist/lib/email/templates']];

for (const [from, to] of assets) {
  const src = join(backendRoot, from);
  if (!existsSync(src)) {
    console.warn(`[copy-assets] skipped missing source: ${from}`);
    continue;
  }
  cpSync(src, join(backendRoot, to), { recursive: true });
  console.log(`[copy-assets] ${from} -> ${to}`);
}
