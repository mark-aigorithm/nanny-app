/**
 * A31 — a mother's children (Profile → Children), and the booking that picks
 * from them.
 *
 * She saves each child once — name and birth month required, then allergies,
 * conditions, diet, interests, languages and notes — and a booking sends only
 * the ids. The server snapshots each child aged on the booking's date, so a
 * later edit never changes what a nanny was told. A nanny browsing the open
 * pool gets ages and health warnings but not names or the mother's notes; the
 * nanny who claims it gets everything.
 *
 * Builds older than Profile → Children still read and write /auth/children;
 * the last test pins that they can no longer wipe what a newer build saved.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeMother, makeNanny } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';

/** `YYYY-MM`, `monthsAgo` months before the current one (UTC). */
function monthsAgo(months: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const LINA = {
  name: 'Lina',
  birthMonth: monthsAgo(4 * 12 + 2),
  allergies: ['Peanuts', 'Strawberries'],
  conditions: ['Asthma'],
  healthNotes: 'Inhaler in the blue bag',
  diet: ['No sugar'],
  interests: ['Lego', 'Drawing'],
  languages: ['Arabic', 'English'],
  notes: 'Naps at 2 with her bunny',
};

async function addChild(token: string, body: object) {
  return request(app)
    .post('/children')
    .set(...authHeader(token))
    .send(body);
}

describe('A31 — a mother manages her children', () => {
  it('adds, edits and removes a child, and works out the age from the birth month', async () => {
    const mother = await makeMother();

    const created = await addChild(mother.token, LINA);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      ...LINA,
      ageYears: 4,
      ageMonths: null,
    });
    const id = created.body.data.id as number;

    const baby = await addChild(mother.token, { name: 'Omar', birthMonth: monthsAgo(8) });
    expect(baby.body.data).toMatchObject({ ageYears: 0, ageMonths: 8, allergies: [], notes: null });

    const edited = await request(app)
      .put(`/children/${id}`)
      .set(...authHeader(mother.token))
      .send({ ...LINA, allergies: ['Peanuts'], notes: null });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ allergies: ['Peanuts'], notes: null });

    const removed = await request(app)
      .delete(`/children/${id}`)
      .set(...authHeader(mother.token));
    expect(removed.status).toBe(200);
    expect((removed.body.data as Array<{ name: string }>).map((c) => c.name)).toEqual(['Omar']);
  });

  it('requires a name and a birth month that is not in the future', async () => {
    const mother = await makeMother();
    expect((await addChild(mother.token, { birthMonth: monthsAgo(12) })).status).toBe(400);
    expect((await addChild(mother.token, { name: '  ', birthMonth: monthsAgo(12) })).status).toBe(
      400,
    );
    expect((await addChild(mother.token, { name: 'Lina' })).status).toBe(400);
    expect((await addChild(mother.token, { name: 'Lina', birthMonth: monthsAgo(-1) })).status).toBe(
      400,
    );
  });

  it('keeps each family to itself and the feature to mothers', async () => {
    const mother = await makeMother();
    const other = await makeMother();
    const nanny = await makeNanny();
    const id = (await addChild(mother.token, LINA)).body.data.id as number;

    const edit = await request(app)
      .put(`/children/${id}`)
      .set(...authHeader(other.token))
      .send(LINA);
    expect(edit.status).toBe(404);
    const del = await request(app)
      .delete(`/children/${id}`)
      .set(...authHeader(other.token));
    expect(del.status).toBe(404);
    expect(
      (
        await request(app)
          .get('/children')
          .set(...authHeader(other.token))
      ).body.data,
    ).toEqual([]);

    expect((await addChild(nanny.token, LINA)).status).toBe(403);
  });
});

describe('A31 — a booking picks from her children', () => {
  it('snapshots the picked children, and the open pool gets no names or notes', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const lina = (await addChild(mother.token, LINA)).body.data.id as number;
    const omar = (await addChild(mother.token, { name: 'Omar', birthMonth: monthsAgo(8) })).body
      .data.id as number;

    const booking = await createBookingViaApi(mother.token, { childIds: [omar, lina] });
    expect(booking.childrenCount).toBe(2);

    // The mother reads her own booking back in full, in the order she picked.
    const mine = await request(app)
      .get(`/bookings/${booking.id}`)
      .set(...authHeader(mother.token));
    expect(mine.body.data.children).toEqual([
      expect.objectContaining({ name: 'Omar', ageYears: 0, allergies: null }),
      expect.objectContaining({
        name: 'Lina',
        ageYears: 4,
        allergies: 'Peanuts, Strawberries',
        conditions: ['Asthma'],
        healthNotes: 'Inhaler in the blue bag',
        notes: 'Naps at 2 with her bunny',
      }),
    ]);

    // In the open pool: ages and the health warning, but no names or notes.
    const pool = await request(app)
      .get('/bookings/available')
      .set(...authHeader(nanny.token));
    const offered = (pool.body.data as Array<{ id: number; children: unknown[] }>).find(
      (b) => b.id === booking.id,
    );
    expect(offered?.children).toEqual([
      expect.objectContaining({ name: null, notes: null, ageYears: 0 }),
      expect.objectContaining({
        name: null,
        notes: null,
        allergies: 'Peanuts, Strawberries',
        conditions: ['Asthma'],
        interests: ['Lego', 'Drawing'],
      }),
    ]);

    // Once she holds it, she gets the names and notes too.
    await claimBooking(nanny.token, booking.id);
    const held = await request(app)
      .get(`/bookings/${booking.id}`)
      .set(...authHeader(nanny.token));
    expect(held.body.data.children[1]).toMatchObject({
      name: 'Lina',
      notes: 'Naps at 2 with her bunny',
    });

    // Editing Lina afterwards does not change what the booking recorded.
    await request(app)
      .put(`/children/${lina}`)
      .set(...authHeader(mother.token))
      .send({ ...LINA, allergies: [] });
    const after = await request(app)
      .get(`/bookings/${booking.id}`)
      .set(...authHeader(mother.token));
    expect(after.body.data.children[1].allergies).toBe('Peanuts, Strawberries');
  });

  it("refuses another family's child", async () => {
    const mother = await makeMother();
    const other = await makeMother();
    const theirs = (await addChild(other.token, LINA)).body.data.id as number;

    await expect(createBookingViaApi(mother.token, { childIds: [theirs] })).rejects.toThrow(/404/);
  });
});

describe('A31 — builds older than Profile → Children', () => {
  it('can still read and add children, but never wipe what a newer build saved', async () => {
    const mother = await makeMother();
    await addChild(mother.token, LINA);

    // An old build's "save for next booking" with a different set: Omar is
    // added, Lina is neither deleted nor overwritten.
    const saved = await request(app)
      .put('/auth/children')
      .set(...authHeader(mother.token))
      .send({ children: [{ name: 'Omar', ageYears: 1, allergies: 'dairy' }] });
    expect(saved.status).toBe(200);

    // The old shape: allergies as one string, an age in years.
    const legacy = await request(app)
      .get('/auth/children')
      .set(...authHeader(mother.token));
    expect(legacy.body.data).toEqual([
      expect.objectContaining({ name: 'Lina', ageYears: 4, allergies: 'Peanuts, Strawberries' }),
      expect.objectContaining({ name: 'Omar', ageYears: 1, allergies: 'dairy' }),
    ]);

    const current = await request(app)
      .get('/children')
      .set(...authHeader(mother.token));
    expect(current.body.data[0]).toMatchObject({ name: 'Lina', interests: ['Lego', 'Drawing'] });
    // Omar came without a birth month, so the app asks for one before he can
    // be booked by id.
    expect(current.body.data[1]).toMatchObject({ name: 'Omar', birthMonth: null, ageYears: 1 });
    await expect(
      createBookingViaApi(mother.token, { childIds: [current.body.data[1].id] }),
    ).rejects.toThrow(/birth month/);
  });
});
