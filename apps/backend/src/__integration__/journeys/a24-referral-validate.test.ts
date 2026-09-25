/**
 * A24 — the signup wizard's referral field confirms who invited her before she
 * submits.
 *
 * The field calls `GET /referrals/validate` from the wizard's last step, where
 * the new mother is already signed in to Firebase (her phone is verified, so
 * the app attaches her token) but `/auth/register` has not run, so there is no
 * `users` row. That in-between caller is the one this endpoint exists for, and
 * it is the one it used to turn away with a 401 — the "Invited by …" line never
 * appeared, though the code was still redeemed after registration.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { makeMother } from '../../../test/factories';

const CODE = 'MONA-7Q2X';

async function validate(code: string, token?: string) {
  const call = request(app).get('/referrals/validate').query({ code });
  const response = await (token ? call.set(...authHeader(token)) : call);
  expect(response.status).toBe(200);
  return response.body.data as {
    valid: boolean;
    referrerFirstName: string | null;
    refereePoints: number;
  };
}

describe('A24: validating a referral code during signup', () => {
  it('names the referrer for a caller signed in to Firebase with no account yet', async () => {
    await makeMother({ firstName: 'Mona', referralCode: CODE });
    const email = `invitee-${Date.now()}@test.local`;
    await createEmulatorUser(email);
    const token = await signInAs(email);

    await expect(validate(CODE.toLowerCase(), token)).resolves.toEqual({
      valid: true,
      referrerFirstName: 'Mona',
      refereePoints: 100,
    });
  });

  it('names the referrer for an anonymous caller', async () => {
    await makeMother({ firstName: 'Mona', referralCode: CODE });

    await expect(validate(CODE)).resolves.toMatchObject({
      valid: true,
      referrerFirstName: 'Mona',
    });
  });

  it('reports the caller’s own code as invalid', async () => {
    const mona = await makeMother({ firstName: 'Mona', referralCode: CODE });

    await expect(validate(CODE, mona.token)).resolves.toMatchObject({
      valid: false,
      referrerFirstName: null,
    });
  });

  it('reports an unknown code as invalid rather than failing', async () => {
    await expect(validate('NOPE-2345')).resolves.toMatchObject({
      valid: false,
      referrerFirstName: null,
    });
  });
});
