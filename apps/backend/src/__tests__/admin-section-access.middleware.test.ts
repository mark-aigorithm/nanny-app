jest.mock('@backend/db/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { verifyIdToken: jest.fn() },
}));

import express, { type Request, type Response } from 'express';
import request from 'supertest';

import type { OperatorPermissions } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { requireAdmin, requireSectionAccess } from '@backend/middleware/admin.middleware';
import { errorHandler } from '@backend/middleware/error.middleware';

const mockPrisma = prisma as unknown as { user: { findUnique: jest.Mock } };

/**
 * Mirrors how the real app mounts the admin router: nested under `/admin`, with
 * the privilege check installed once at the router level.
 *
 * This is the test that proves the wiring, not just the table — the middleware
 * matches on `req.path`, and if Express handed it `/admin/bookings` instead of
 * `/bookings` every single endpoint would 403. Nothing in a unit test of the
 * table itself would catch that.
 */
function buildApp() {
  const adminRouter = express.Router();
  adminRouter.use(fakeAuth, requireAdmin, requireSectionAccess);

  const echo = (_req: Request, res: Response) => res.json({ ok: true });
  adminRouter.get('/bookings', echo);
  adminRouter.post('/bookings/:id/approve', echo);
  adminRouter.put('/config', echo);
  adminRouter.get('/promo-codes', echo);

  const app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

/** Stands in for `requireAuth` — the token itself isn't what's under test. */
function fakeAuth(req: Request, _res: Response, next: () => void) {
  req.firebaseUser = { uid: 'uid-1' } as NonNullable<Request['firebaseUser']>;
  next();
}

function signedInAs(role: string, adminPermissions: OperatorPermissions | null = null) {
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 5,
    role,
    adminPermissions,
    isActive: true,
    deletedAt: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireSectionAccess (mounted the way the app mounts it)', () => {
  it('resolves paths relative to the /admin mount', async () => {
    signedInAs('OPERATOR', { bookings: 'VIEW' });

    // If the middleware saw "/admin/bookings" this would be an unmapped path → 403.
    await request(buildApp()).get('/admin/bookings').expect(200);
  });

  it('refuses a section the operator does not hold', async () => {
    signedInAs('OPERATOR', { bookings: 'VIEW' });

    const res = await request(buildApp()).get('/admin/promo-codes').expect(403);
    expect(res.body.error).toContain('Promo Codes');
  });

  it('refuses a write when the operator only has view', async () => {
    signedInAs('OPERATOR', { bookings: 'VIEW' });

    await request(buildApp()).post('/admin/bookings/12/approve').expect(403);
  });

  it('allows the write once the operator has manage', async () => {
    signedInAs('OPERATOR', { bookings: 'MANAGE' });

    await request(buildApp()).post('/admin/bookings/12/approve').expect(200);
  });

  it('scopes PUT /config by the keys in the body', async () => {
    signedInAs('OPERATOR', { pricing: 'MANAGE' });

    await request(buildApp()).put('/admin/config').send({ standardHourlyRate: 90 }).expect(200);
    await request(buildApp()).put('/admin/config').send({ broadcastRadiusKm: 12 }).expect(403);
  });

  it('lets a full admin through', async () => {
    signedInAs('ADMIN');

    await request(buildApp()).get('/admin/promo-codes').expect(200);
    await request(buildApp()).put('/admin/config').send({ broadcastRadiusKm: 12 }).expect(200);
  });

  it('turns away a deactivated console account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 5,
      role: 'OPERATOR',
      adminPermissions: { bookings: 'MANAGE' },
      isActive: false,
      deletedAt: null,
    });

    await request(buildApp()).get('/admin/bookings').expect(403);
  });

  it('turns away a non-console role', async () => {
    signedInAs('MOTHER');

    await request(buildApp()).get('/admin/bookings').expect(403);
  });
});
