/**
 * A44 — last app open and last real sign-in, recorded separately.
 * `POST /me/app-open` stamps `lastAppOpenAt`, at most once a minute however
 * often the app pings; `GET /auth/me` stamps `lastLoginAt` with the token's
 * sign-in time (`auth_time`) and never moves it backwards.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeMother } from '../../../test/factories';

function ping(token: string) {
  return request(app).post('/me/app-open').set(...authHeader(token));
}

async function lastAppOpenAt(userId: number): Promise<Date | null> {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lastAppOpenAt: true } });
  return row.lastAppOpenAt;
}

/** The `auth_time` claim of an ID token, as a Date. */
function authTimeOf(token: string): Date {
  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    auth_time: number;
  };
  return new Date(payload.auth_time * 1000);
}

describe('A44 — POST /me/app-open', () => {
  it('records the open and answers 204 with no body', async () => {
    const mother = await makeMother();
    expect(await lastAppOpenAt(mother.id)).toBeNull();

    const before = Date.now();
    const res = await ping(mother.token);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const stamped = await lastAppOpenAt(mother.id);
    expect(stamped).not.toBeNull();
    // Database clock vs. test clock: allow a little skew either way.
    expect(Math.abs((stamped as Date).getTime() - before)).toBeLessThan(10_000);
  });

  it('leaves the time alone for a second ping within 60 seconds', async () => {
    const mother = await makeMother();
    expect((await ping(mother.token)).status).toBe(204);
    const first = await lastAppOpenAt(mother.id);

    expect((await ping(mother.token)).status).toBe(204);

    expect(await lastAppOpenAt(mother.id)).toEqual(first);
  });

  it('moves the time on once the last open is over a minute old', async () => {
    const twoMinutesAgo = new Date(Date.now() - 120_000);
    const mother = await makeMother({ lastAppOpenAt: twoMinutesAgo });

    expect((await ping(mother.token)).status).toBe(204);

    const stamped = await lastAppOpenAt(mother.id);
    expect((stamped as Date).getTime()).toBeGreaterThan(twoMinutesAgo.getTime());
  });

  it('refuses a request without a token', async () => {
    const res = await request(app).post('/me/app-open');
    expect(res.status).toBe(401);
  });
});

describe('A44 — GET /auth/me records the real sign-in', () => {
  it("writes the token's auth_time as lastLoginAt", async () => {
    const mother = await makeMother();

    expect((await request(app).get('/auth/me').set(...authHeader(mother.token))).status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: mother.id }, select: { lastLoginAt: true } });
    expect(row.lastLoginAt).toEqual(authTimeOf(mother.token));
  });

  it('never moves lastLoginAt backwards, and does not touch lastAppOpenAt', async () => {
    const later = new Date(Date.now() + 3_600_000);
    const mother = await makeMother({ lastLoginAt: later });

    expect((await request(app).get('/auth/me').set(...authHeader(mother.token))).status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: mother.id },
      select: { lastLoginAt: true, lastAppOpenAt: true },
    });
    expect(row.lastLoginAt).toEqual(later);
    expect(row.lastAppOpenAt).toBeNull();
  });
});
