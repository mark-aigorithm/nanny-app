/**
 * A20 — editing a profile, and where the edit shows up.
 *
 * A mother edits her own account from the app: her details through
 * `PATCH /auth/me`, her children through `PUT /auth/children`. A nanny's
 * professional profile is deliberately not hers to edit — the app's Profile
 * tab is read-only and an operator makes the change in the console — so her
 * half of this journey is driven from the admin routes and read back through
 * `GET /nanny/profile`, the screen she actually opens.
 *
 * Both halves check the two places a change has to land: the account's own
 * read-back, and the console record an operator would compare it against. A
 * skill an operator removes is also what stops a nanny being offered requests
 * priced for it (A15), so that seam is closed here too.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny, makeSkill } from '../../../test/factories';
import { createBookingViaApi } from '../../../test/journeys/booking';

async function me(token: string) {
  const response = await request(app).get('/auth/me').set(...authHeader(token));
  expect(response.status).toBe(200);
  return response.body.data as Record<string, unknown>;
}

describe('A20 — a mother edits her account', () => {
  it('changes her name, photo and address, and the console sees the same record', async () => {
    const mother = await makeMother();
    const admin = await makeAdmin();

    const response = await request(app)
      .patch('/auth/me')
      .set(...authHeader(mother.token))
      .send({
        firstName: 'Nadia',
        lastName: 'Hassan',
        avatarUrl: 'https://storage.example.test/nadia.jpg',
        address: '14 Garden Street, Maadi',
        latitude: 29.9602,
        longitude: 31.2569,
      });
    expect(response.status).toBe(200);

    // Reopening the screen reads /auth/me again.
    expect(await me(mother.token)).toMatchObject({
      firstName: 'Nadia',
      lastName: 'Hassan',
      avatarUrl: 'https://storage.example.test/nadia.jpg',
      address: '14 Garden Street, Maadi',
    });

    const console_ = await request(app)
      .get(`/admin/mothers/${mother.id}`)
      .set(...authHeader(admin.token));
    expect(console_.status).toBe(200);
    expect(console_.body.data).toMatchObject({
      firstName: 'Nadia',
      lastName: 'Hassan',
      // The console calls the address "location".
      location: '14 Garden Street, Maadi',
    });
  });

  it('adds and removes children, and the saved list is what the booking form offers', async () => {
    const mother = await makeMother();
    const children = (body: object) =>
      request(app).put('/auth/children').set(...authHeader(mother.token)).send(body);

    let saved = await children({
      children: [
        { name: 'Layla', ageYears: 4, allergies: 'peanuts' },
        { name: 'Omar', ageYears: 1, allergies: null },
      ],
    });
    expect(saved.status).toBe(200);

    let list = await request(app).get('/auth/children').set(...authHeader(mother.token));
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Layla', ageYears: 4, allergies: 'peanuts' }),
        expect.objectContaining({ name: 'Omar', ageYears: 1 }),
      ]),
    );

    // Removing one is a save of the list without it.
    saved = await children({ children: [{ name: 'Layla', ageYears: 4, allergies: 'peanuts' }] });
    expect(saved.status).toBe(200);

    list = await request(app).get('/auth/children').set(...authHeader(mother.token));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ name: 'Layla' });

    // A saved child is bookable by exactly the details she entered.
    const booking = await createBookingViaApi(mother.token, {
      children: [{ name: 'Layla', ageYears: 4, allergies: 'peanuts' }],
    });
    expect(booking.status).toBe('PENDING');
  });

  it('refuses a blank name rather than saving it', async () => {
    const mother = await makeMother();
    const response = await request(app)
      .patch('/auth/me')
      .set(...authHeader(mother.token))
      .send({ firstName: '   ' });
    expect(response.status).toBe(400);
    expect((await me(mother.token)).firstName).toBe('Test');
  });
});

describe('A20 — an operator edits a nanny', () => {
  it('changes her bio and experience, and her own Profile tab shows the change', async () => {
    const nanny = await makeNanny();
    const admin = await makeAdmin();

    const response = await request(app)
      .patch(`/admin/nannies/${nanny.nannyProfileId}`)
      .set(...authHeader(admin.token))
      .send({ bio: 'Twelve years with newborns and twins.', yearsOfExperience: 12 });
    expect(response.status).toBe(200);

    const own = await request(app).get('/nanny/profile').set(...authHeader(nanny.token));
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({
      bio: 'Twelve years with newborns and twins.',
      yearsOfExperience: 12,
    });

    const console_ = await request(app)
      .get(`/admin/nannies/${nanny.nannyProfileId}`)
      .set(...authHeader(admin.token));
    expect(console_.body.data).toMatchObject({ yearsOfExperience: 12 });
  });

  it('a skill the operator removes stops her being offered requests that need it', async () => {
    const skill = await makeSkill();
    const nanny = await makeNanny({ skillIds: [skill.id] });
    const admin = await makeAdmin();
    const mother = await makeMother();

    const held = await request(app).get('/nanny/profile').set(...authHeader(nanny.token));
    expect((held.body.data.skills as Array<{ id: number }>).map((s) => s.id)).toContain(skill.id);

    const response = await request(app)
      .put(`/admin/nannies/${nanny.nannyProfileId}/skills`)
      .set(...authHeader(admin.token))
      .send({ skillIds: [] });
    expect(response.status).toBe(200);

    const after = await request(app).get('/nanny/profile').set(...authHeader(nanny.token));
    expect(after.body.data.skills).toEqual([]);

    const booking = await createBookingViaApi(mother.token, { skillIds: [skill.id] });
    const pool = await request(app).get('/bookings/available').set(...authHeader(nanny.token));
    expect((pool.body.data as Array<{ id: number }>).map((b) => b.id)).not.toContain(booking.id);
  });

  it('is not something the nanny can do herself', async () => {
    const nanny = await makeNanny();
    const forbidden = await request(app)
      .patch(`/admin/nannies/${nanny.nannyProfileId}`)
      .set(...authHeader(nanny.token))
      .send({ bio: 'Self-edited.' });
    expect(forbidden.status).toBe(403);
  });
});
