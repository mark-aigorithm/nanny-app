/**
 * Pins which routes are actually mounted behind `requireFreshAuth` versus
 * `requireAuth`. The integration suite can't tell them apart — the Auth
 * emulator checks revocation on every `verifyIdToken` call regardless of the
 * `checkRevoked` argument a route's middleware passes — so this is the one
 * place that wiring is proven, by asserting the exact call `verifyIdToken`
 * receives.
 *
 * Mounts the real routers (not a stand-in), with only the infrastructure they
 * import mocked: Firebase Admin (whose rejection stops the request before any
 * service runs) and Prisma/config (so the unit project, which loads no env
 * file, never touches a service or the real database).
 */
jest.mock('@backend/lib/config', () => ({
  config: {
    firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' },
    nodeEnv: 'test',
    paymob: { enabled: false },
    email: { enabled: false },
    qaChecklistEnabled: false,
    e2eLiveAuthEnabled: false,
  },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { verifyIdToken: jest.fn() },
}));
jest.mock('@backend/db/prisma', () => ({ prisma: {} }));

import express from 'express';
import request from 'supertest';

import { firebaseAuth } from '@backend/lib/firebase';
import { errorHandler } from '@backend/middleware/error.middleware';
import { adminRouter } from '@backend/routes/admin.routes';
import { authRouter } from '@backend/routes/auth.routes';

const mockVerifyIdToken = firebaseAuth.verifyIdToken as jest.Mock;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

/**
 * A real-shaped rejection, so `bearerAuth` takes its "token was checked and
 * refused" branch rather than falling through to something else — no
 * downstream service ever runs, since every case here fails at the
 * middleware.
 */
function refusedToken(): Error {
  return Object.assign(new Error('auth/argument-error'), { code: 'auth/argument-error' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockRejectedValue(refusedToken());
});

describe('route wiring — which routes ask Firebase to check revocation', () => {
  it('POST /auth/register is on requireFreshAuth', async () => {
    await request(buildApp()).post('/auth/register').set('Authorization', 'Bearer tok').send({});
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok', true);
  });

  it('GET /auth/me is on requireAuth, with no revocation check', async () => {
    await request(buildApp()).get('/auth/me').set('Authorization', 'Bearer tok');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok');
    expect(mockVerifyIdToken).not.toHaveBeenCalledWith('tok', true);
  });

  it('an admin route is on requireFreshAuth', async () => {
    await request(buildApp()).get('/admin/nannies').set('Authorization', 'Bearer tok');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok', true);
  });
});
