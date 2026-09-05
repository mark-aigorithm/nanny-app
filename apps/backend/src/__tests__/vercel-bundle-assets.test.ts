import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The Vercel build command is `pnpm db:generate && node esbuild.config.mjs` —
// it never runs `pnpm build`, so scripts/copy-assets.mjs (which mirrors the
// templates into dist/lib/email/templates for `node dist/server.js`) does not
// run on a deploy. esbuild also flattens the app into a single
// dist/vercel-bundle.cjs, so at runtime `__dirname` inside render.ts is dist/
// itself and it reads dist/templates — a different path again.
//
// Both facts together mean the deployed function had no email templates at all
// and every send threw ENOENT. This test pins the packaging contract: whatever
// the bundle's __dirname-relative loader will look for must exist next to the
// bundle after the build Vercel actually runs.

const backendRoot = path.join(__dirname, '..', '..');
const srcTemplates = path.join(backendRoot, 'src', 'lib', 'email', 'templates');
const bundle = path.join(backendRoot, 'dist', 'vercel-bundle.cjs');
// Mirrors `path.join(__dirname, 'templates')` in src/lib/email/render.ts as it
// resolves once the module is bundled into dist/vercel-bundle.cjs.
const bundledTemplates = path.join(path.dirname(bundle), 'templates');

describe('vercel bundle packaging', () => {
  beforeAll(() => {
    fs.rmSync(bundledTemplates, { recursive: true, force: true });
    execFileSync('node', ['esbuild.config.mjs'], { cwd: backendRoot, stdio: 'pipe' });
  }, 180_000);

  it('emits the serverless bundle', () => {
    expect(fs.existsSync(bundle)).toBe(true);
  });

  it('ships every email template where the bundled renderer looks for it', () => {
    const expected = fs.readdirSync(srcTemplates).filter((f) => f.endsWith('.html')).sort();
    expect(expected.length).toBeGreaterThan(0);

    expect(fs.existsSync(bundledTemplates)).toBe(true);
    expect(fs.readdirSync(bundledTemplates).sort()).toEqual(expected);
  });

  it('ships the templates byte-for-byte, not a stale copy', () => {
    for (const file of fs.readdirSync(srcTemplates).filter((f) => f.endsWith('.html'))) {
      expect(fs.readFileSync(path.join(bundledTemplates, file), 'utf8')).toBe(
        fs.readFileSync(path.join(srcTemplates, file), 'utf8'),
      );
    }
  });
});
