/**
 * A29 — a mother or nanny deletes her own account (DELETE /auth/me with
 * `{ confirm: 'delete-my-account' }`).
 *
 * Deletion is immediate: the `users` row is soft-deleted with its email, phone
 * and uid scrambled — so all three can be registered again — and the Firebase
 * user is deleted. The nanny profile (out of search) and device tokens (no more
 * pushes) go with it. A bodiless call is plan 3's discard and must never delete
 * a real account; an active booking blocks deletion; staff are refused.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

import { authHeader } from '../../../test/auth';
import { makeBooking, makeMother, makeNanny, makeOperator } from '../../../test/factories';

function uniquePhone(): string {
  return `+2019${String(Date.now()).slice(-8)}`;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

const CONFIRM = { confirm: 'delete-my-account' } as const;

const CANT_REMOVE = "This account can't be removed here.";
const HAS_BOOKINGS = 'Finish or cancel your upcoming bookings before deleting your account.';
const STAFF = 'Staff accounts are removed from the admin console.';

function deleteAccount(token: string, body?: object) {
  const call = request(app).delete('/auth/me').set(...authHeader(token));
  return body === undefined ? call : call.send(body);
}

/** Asserts the row and Firebase user are exactly as the factory left them. */
async function expectUntouched(user: { id: number; firebaseUid: string; email: string }) {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(row.deletedAt).toBeNull();
  expect(row.deletionRequestedAt).toBeNull();
  expect(row.isActive).toBe(true);
  expect(row.email).toBe(user.email);
  expect(row.firebaseUid).toBe(user.firebaseUid);
  await expect(firebaseAuth.getUser(user.firebaseUid)).resolves.toMatchObject({
    uid: user.firebaseUid,
  });
}

/** Ids of the nannies a parent browsing search can see. */
async function listedNannyProfileIds(viewerToken: string): Promise<number[]> {
  const response = await request(app).get('/nanny/nannies').set(...authHeader(viewerToken));
  expect(response.status).toBe(200);
  return (response.body.data as Array<{ nannyProfileId: number }>).map((n) => n.nannyProfileId);
}

describe('A29 — DELETE /auth/me deletes a mother', () => {
  it('scrambles and soft-deletes the row, deletes the Firebase user, and ends the session', async () => {
    const phone = uniquePhone();
    const mother = await makeMother({ phone });

    const response = await deleteAccount(mother.token, CONFIRM);

    expect(response.status).toBe(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.deletionRequestedAt).toBeInstanceOf(Date);
    expect(row.isActive).toBe(false);
    expect(row.email).toMatch(/@deleted\.nannyapp\.invalid$/);
    expect(row.phone).toBeNull();
    expect(row.firebaseUid.startsWith('deleted:')).toBe(true);

    await expect(firebaseAuth.getUser(mother.firebaseUid)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });

    // The token she deleted with still has time on it, but no longer acts.
    const me = await request(app).get('/auth/me').set(...authHeader(mother.token));
    expect(me.status).toBe(401);
  });

  it('frees her email and phone, so the same pair can register again', async () => {
    const email = uniqueEmail('a29-reuse');
    const phone = uniquePhone();
    const first = await makeMother({ email, phone });

    expect((await deleteAccount(first.token, CONFIRM)).status).toBe(204);

    const second = await makeMother({ email, phone });

    expect(second.id).not.toBe(first.id);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: second.id } });
    expect(row.email).toBe(email);
    expect(row.phone).toBe(phone);
  });

  it('soft-deletes her device tokens', async () => {
    const mother = await makeMother();
    const registered = await request(app)
      .post('/devices/push-token')
      .set(...authHeader(mother.token))
      .send({ token: `a29-push-${mother.id}`, platform: 'ios' });
    expect(registered.status).toBe(201);

    expect((await deleteAccount(mother.token, CONFIRM)).status).toBe(204);

    const tokens = await prisma.deviceToken.findMany({ where: { userId: mother.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.deletedAt).toBeInstanceOf(Date);
  });

  it('refuses a call without the confirm body — plan 3 discard contract — leaving everything intact', async () => {
    const mother = await makeMother();

    const response = await deleteAccount(mother.token);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(CANT_REMOVE);
    await expectUntouched(mother);
  });

  it('refuses while she has a CONFIRMED booking, then deletes once it is COMPLETED', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const booking = await makeBooking({
      motherId: mother.id,
      nannyProfileId: nanny.nannyProfileId,
      status: 'CONFIRMED',
    });

    const refused = await deleteAccount(mother.token, CONFIRM);

    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(HAS_BOOKINGS);
    await expectUntouched(mother);

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });

    const deleted = await deleteAccount(mother.token, CONFIRM);

    expect(deleted.status).toBe(204);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
  });
});

describe('A29 — DELETE /auth/me deletes a nanny', () => {
  it('refuses while a booking on her profile is IN_PROGRESS', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    await makeBooking({
      motherId: mother.id,
      nannyProfileId: nanny.nannyProfileId,
      status: 'IN_PROGRESS',
    });

    const response = await deleteAccount(nanny.token, CONFIRM);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(HAS_BOOKINGS);
    await expectUntouched(nanny);
    const profile = await prisma.nannyProfile.findUniqueOrThrow({ where: { id: nanny.nannyProfileId } });
    expect(profile.deletedAt).toBeNull();
  });

  it('with no active bookings, soft-deletes her profile and drops her out of search', async () => {
    const nanny = await makeNanny();
    const mother = await makeMother();
    expect(await listedNannyProfileIds(mother.token)).toContain(nanny.nannyProfileId);

    const response = await deleteAccount(nanny.token, CONFIRM);

    expect(response.status).toBe(204);
    const profile = await prisma.nannyProfile.findUniqueOrThrow({ where: { id: nanny.nannyProfileId } });
    expect(profile.deletedAt).toBeInstanceOf(Date);
    expect(await listedNannyProfileIds(mother.token)).not.toContain(nanny.nannyProfileId);
  });
});

describe('A29 — DELETE /auth/me refuses staff', () => {
  it('403s an operator, leaving her account intact', async () => {
    const operator = await makeOperator();

    const response = await deleteAccount(operator.token, CONFIRM);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(STAFF);
    await expectUntouched(operator);
  });
});
