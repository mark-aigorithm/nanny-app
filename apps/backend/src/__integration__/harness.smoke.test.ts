/**
 * Proves the integration harness itself, end to end.
 *
 * This is not a test of product behaviour — it is the test that fails loudly
 * when the *environment* is wrong, so that a real suite's failure can always be
 * read as a real defect. In one request it exercises:
 *
 *   • the migrated PostGIS schema           (the factory writes rows)
 *   • the data factories                    (Firebase account + users row)
 *   • the Auth emulator                     (a genuine sign-in, a genuine JWT)
 *   • the real requireAuth middleware       (firebaseAuth.verifyIdToken)
 *   • the real response envelope            ({ data, error })
 *   • per-test reset                        (the second test sees a clean DB)
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../test/auth';
import { makeMother } from '../../test/factories';

describe('integration harness', () => {
  it('serves an unauthenticated health check', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' }, error: null });
  });

  it('rejects a request with no bearer token', async () => {
    const response = await request(app).get('/auth/me');

    expect(response.status).toBe(401);
    // The error envelope carries a message and never a data payload.
    expect(response.body.data).toBeNull();
    expect(typeof response.body.error).toBe('string');
  });

  it('accepts an emulator-issued token through the real auth middleware', async () => {
    const mother = await makeMother();

    const response = await request(app).get('/auth/me').set(...authHeader(mother.token));

    expect(response.status).toBe(200);
    expect(response.body.error).toBeNull();
    expect(response.body.data).toMatchObject({ email: mother.email, role: 'MOTHER' });
  });

  it('persists factory rows to the real database', async () => {
    const mother = await makeMother();

    // Read back independently of whatever the factory returned.
    const persisted = await prisma.user.findUnique({ where: { id: mother.id } });

    expect(persisted).not.toBeNull();
    expect(persisted?.firebaseUid).toBe(mother.firebaseUid);
    // Compared numerically: the column is Decimal(10,7), but Prisma's Decimal
    // trims trailing zeros on the way out, so the string form is "30.0444".
    expect(Number(persisted?.latitude)).toBe(30.0444);
  });

  it('starts each test from an empty database', async () => {
    // The two preceding tests each created a mother. If the reset were not
    // running, this count would be non-zero.
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('restores the seeded platform settings after each reset', async () => {
    const rate = await prisma.appSettings.findUnique({
      where: { key: 'standard_hourly_rate' },
    });

    expect(rate?.value).toBe('120');
  });
});
