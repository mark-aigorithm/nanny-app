/**
 * A27 — GET /auth/me re-attaches a row whose Firebase account was deleted.
 *
 * A row's `firebaseUid` goes stale when its owner's Firebase account is
 * deleted (account recovery, a support action) and she signs back in: Firebase
 * mints a brand new uid that no row points at, so the plain uid lookup finds
 * nothing and would 404 forever, even though her row — and her data — are
 * still right there. This proves the real route re-points that row once the
 * new token proves the row's phone and the old uid is confirmed gone, and
 * that it refuses to touch anything while the old account still exists.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { makeMother } from '../../../test/factories';

function uniquePhone(): string {
  return `+2018${String(Date.now()).slice(-8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

describe('A27 — GET /auth/me re-attaches an orphaned row', () => {
  it('moves the row onto a fresh uid once the old Firebase account is confirmed gone', async () => {
    const phone = uniquePhone();
    const mother = await makeMother({ phone });

    await firebaseAuth.deleteUser(mother.firebaseUid);

    const newEmail = uniqueEmail('a27-reattach');
    await createEmulatorUser(newEmail, undefined, phone);
    const newToken = await signInAs(newEmail);

    const response = await request(app).get('/auth/me').set(...authHeader(newToken));

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(mother.id);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.firebaseUid).not.toBe(mother.firebaseUid);
    expect(response.body.data.firebaseUid).toBe(row.firebaseUid);
  });

  it('404s and leaves the row untouched while the old Firebase account still exists', async () => {
    const phone = uniquePhone();
    const mother = await makeMother({ phone });
    // The old account is never deleted in this case.

    const newEmail = uniqueEmail('a27-still-exists');
    await createEmulatorUser(newEmail, undefined, phone);
    const newToken = await signInAs(newEmail);

    const response = await request(app).get('/auth/me').set(...authHeader(newToken));

    expect(response.status).toBe(404);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.firebaseUid).toBe(mother.firebaseUid);
    await expect(firebaseAuth.getUser(mother.firebaseUid)).resolves.toMatchObject({
      uid: mother.firebaseUid,
    });
  });
});
