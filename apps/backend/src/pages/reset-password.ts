import fs from 'node:fs';
import path from 'node:path';

import Handlebars from 'handlebars';

/**
 * The branded page Firebase's reset email links to (its "action URL"). Static
 * files under ./reset-password, loaded `__dirname`-relative like the email
 * templates: src/ under ts-jest/ts-node, dist/pages/ from the tsc build
 * (scripts/copy-assets.mjs), dist/ from the Vercel bundle (esbuild.config.mjs,
 * shipped by vercel.json's includeFiles).
 */

const pageDir = path.join(__dirname, 'reset-password');

export type ResetPasswordAsset = 'app.js' | 'app.css';

const cache = new Map<string, string>();
function read(fileName: string): string {
  const cached = cache.get(fileName);
  if (cached !== undefined) return cached;
  const source = fs.readFileSync(path.join(pageDir, fileName), 'utf8');
  cache.set(fileName, source);
  return source;
}

let compiledPage: Handlebars.TemplateDelegate | null = null;

export interface ResetPasswordPageVars {
  /** Identity Toolkit's base URL — the real service, or the Auth emulator's. */
  identityToolkitBase: string;
  /** Firebase's own hosted handler, for the actions this page doesn't handle. */
  fallbackHandler: string;
}

export function renderResetPasswordPage(vars: ResetPasswordPageVars): string {
  compiledPage ??= Handlebars.compile(read('index.html'));
  return compiledPage(vars);
}

export function readResetPasswordAsset(asset: ResetPasswordAsset): string {
  return read(asset);
}
