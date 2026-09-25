jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp' } },
}));

import express from 'express';
import request from 'supertest';

import { resetPasswordPageRouter } from '@backend/routes/reset-password-page.routes';

function buildApp() {
  const app = express();
  app.use('/auth/action', resetPasswordPageRouter);
  return app;
}

const EMULATOR_ENV = 'FIREBASE_AUTH_EMULATOR_HOST';
const savedEmulatorHost = process.env[EMULATOR_ENV];

afterEach(() => {
  if (savedEmulatorHost === undefined) delete process.env[EMULATOR_ENV];
  else process.env[EMULATOR_ENV] = savedEmulatorHost;
});

describe('GET /auth/action', () => {
  beforeEach(() => {
    delete process.env[EMULATOR_ENV];
  });

  it('serves the page with the Identity Toolkit endpoint and the fallback handler filled in', async () => {
    const res = await request(buildApp()).get('/auth/action?mode=resetPassword&oobCode=abc');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('data-identity-toolkit="https://identitytoolkit.googleapis.com"');
    expect(res.text).toContain(
      'data-fallback-handler="https://demo-nannyapp.firebaseapp.com/__/auth/action"',
    );
    expect(res.text).toContain('src="/auth/action/app.js"');
    expect(res.text).not.toMatch(/\{\{/);
  });

  it('lets the page reach Identity Toolkit and nothing else it does not need', async () => {
    const res = await request(buildApp()).get('/auth/action');
    const csp = String(res.headers['content-security-policy']);

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain('connect-src https://identitytoolkit.googleapis.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('never leaks the one-time code: no referrer, no caching', async () => {
    const res = await request(buildApp()).get('/auth/action?oobCode=abc');

    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('points at the Auth emulator when the backend does', async () => {
    process.env[EMULATOR_ENV] = '127.0.0.1:9099';

    const res = await request(buildApp()).get('/auth/action');

    expect(res.text).toContain(
      'data-identity-toolkit="http://127.0.0.1:9099/identitytoolkit.googleapis.com"',
    );
    expect(String(res.headers['content-security-policy'])).toContain(
      'connect-src http://127.0.0.1:9099',
    );
  });
});

describe('page assets', () => {
  it('serves the script and the stylesheet', async () => {
    const js = await request(buildApp()).get('/auth/action/app.js');
    const css = await request(buildApp()).get('/auth/action/app.css');

    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(js.text).toContain('accounts:resetPassword');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toMatch(/text\/css/);
  });
});
