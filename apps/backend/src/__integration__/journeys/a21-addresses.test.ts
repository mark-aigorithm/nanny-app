/**
 * A21 — the address book, and the address a booking is made at.
 *
 * A mother keeps several addresses and picks one when she books; the booking
 * snapshots it, so the nanny is sent where the booking was made even after the
 * entry is edited. The nanny sees only the area until the booking is paid for,
 * then the whole address — and her own single address is set at registration
 * and thereafter changed only by an operator in the console, which is also
 * where proximity search reads it from.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny } from '../../../test/factories';
import { claimBooking, createBookingViaApi } from '../../../test/journeys/booking';
import { payViaPaymob } from '../../../test/journeys/payment';

const WORK = {
  label: 'Work',
  formattedAddress: 'Smart Village, Giza Governorate, Egypt',
  governorate: 'Giza',
  area: 'Sheikh Zayed',
  landmark: 'Building B7, 3rd floor',
  latitude: 30.0716,
  longitude: 31.0165,
};

async function myAddresses(token: string) {
  const response = await request(app).get('/addresses').set(...authHeader(token));
  expect(response.status).toBe(200);
  return response.body.data as Array<Record<string, unknown> & { id: number; isDefault: boolean }>;
}

describe('A21 — a mother manages her address book', () => {
  it('starts with the address she registered with, as her default', async () => {
    const mother = await makeMother();

    const list = await myAddresses(mother.token);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: mother.addressId,
      label: 'Home',
      formattedAddress: '1 Test Street, Cairo',
      isDefault: true,
      latitude: 30.0444,
      longitude: 31.2357,
    });
    // The flattened profile fields are derived from the same row.
    const me = await request(app).get('/auth/me').set(...authHeader(mother.token));
    expect(me.body.data).toMatchObject({ address: '1 Test Street, Cairo', latitude: 30.0444 });
  });

  it('adds, edits, promotes and deletes addresses, keeping exactly one default', async () => {
    const mother = await makeMother();

    const created = await request(app)
      .post('/addresses')
      .set(...authHeader(mother.token))
      .send(WORK);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ label: 'Work', isDefault: false, street: null });
    const workId = created.body.data.id as number;

    const patched = await request(app)
      .patch(`/addresses/${workId}`)
      .set(...authHeader(mother.token))
      .send({ street: '7 Road 90', isDefault: true });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ street: '7 Road 90', isDefault: true, landmark: WORK.landmark });

    let list = await myAddresses(mother.token);
    expect(list.map((a) => [a['label'], a.isDefault])).toEqual([
      ['Work', true],
      ['Home', false],
    ]);

    // Un-defaulting the default directly is refused; promote the other instead.
    const refused = await request(app)
      .patch(`/addresses/${workId}`)
      .set(...authHeader(mother.token))
      .send({ isDefault: false });
    expect(refused.status).toBe(400);

    const promoted = await request(app)
      .post(`/addresses/${mother.addressId}/default`)
      .set(...authHeader(mother.token));
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.map((a: { label: string; isDefault: boolean }) => [a.label, a.isDefault])).toEqual([
      ['Home', true],
      ['Work', false],
    ]);

    // Deleting the default promotes the survivor.
    const deleted = await request(app)
      .delete(`/addresses/${mother.addressId}`)
      .set(...authHeader(mother.token));
    expect(deleted.status).toBe(200);
    list = await myAddresses(mother.token);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: workId, isDefault: true });
  });

  it('cannot reach another mother’s address', async () => {
    const [alice, bob] = await Promise.all([makeMother(), makeMother()]);

    const response = await request(app)
      .patch(`/addresses/${bob.addressId}`)
      .set(...authHeader(alice.token))
      .send({ landmark: 'nope' });
    expect(response.status).toBe(404);
  });

  it('a nanny can read her address but only support can change it', async () => {
    const nanny = await makeNanny();

    expect(await myAddresses(nanny.token)).toHaveLength(1);

    const response = await request(app)
      .post('/addresses')
      .set(...authHeader(nanny.token))
      .send(WORK);
    expect(response.status).toBe(403);
  });
});

describe('A21 — the address a booking is made at', () => {
  it('books at the chosen address, snapshots it, and refuses an address that is not hers', async () => {
    const [mother, other] = await Promise.all([makeMother(), makeMother()]);
    const work = await request(app).post('/addresses').set(...authHeader(mother.token)).send(WORK);
    const workId = work.body.data.id as number;

    const booking = await createBookingViaApi(mother.token, { addressId: workId });
    expect(booking['address']).toMatchObject({
      area: 'Sheikh Zayed, Giza',
      details: { addressId: workId, label: 'Work', landmark: WORK.landmark, latitude: WORK.latitude },
    });

    // Editing the entry afterwards does not move the booking.
    await request(app)
      .patch(`/addresses/${workId}`)
      .set(...authHeader(mother.token))
      .send({ landmark: 'moved', latitude: 31.2 });
    const reread = await request(app).get(`/bookings/${booking.id}`).set(...authHeader(mother.token));
    expect(reread.body.data.address.details).toMatchObject({ landmark: WORK.landmark, latitude: WORK.latitude });

    const foreign = await request(app)
      .post('/bookings')
      .set(...authHeader(mother.token))
      .send({
        startTime: `${booking['date']}T15:00:00`,
        endTime: `${booking['date']}T19:00:00`,
        children: [{ name: null, ageYears: 3, allergies: null }],
        addressId: other.addressId,
      });
    expect(foreign.status).toBe(404);
  });

  it('shows the nanny only the area until the booking is paid for', async () => {
    const mother = await makeMother();
    const nanny = await makeNanny();
    const booking = await createBookingViaApi(mother.token);

    const pool = await request(app).get('/bookings/available').set(...authHeader(nanny.token));
    expect(pool.status).toBe(200);
    const offered = (pool.body.data as Array<{ id: number; address: unknown }>).find((b) => b.id === booking.id);
    expect(offered?.address).toEqual({ area: '1 Test Street, Cairo', details: null });

    await claimBooking(nanny.token, booking.id);
    const approved = await request(app).get(`/bookings/${booking.id}`).set(...authHeader(nanny.token));
    expect(approved.body.data.address.details).toBeNull();

    await payViaPaymob(mother.token, 'booking', booking.id);
    const confirmed = await request(app).get(`/bookings/${booking.id}`).set(...authHeader(nanny.token));
    expect(confirmed.body.data.status).toBe('CONFIRMED');
    expect(confirmed.body.data.address.details).toMatchObject({
      formattedAddress: '1 Test Street, Cairo',
      latitude: 30.0444,
    });
  });
});

describe('A21 — an operator moves a nanny', () => {
  it('rewrites her single address, and proximity search and her profile follow', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();

    const moved = await request(app)
      .put(`/admin/nannies/${nanny.nannyProfileId}/address`)
      .set(...authHeader(admin.token))
      .send({
        formattedAddress: '5 Corniche, Alexandria',
        governorate: 'Alexandria',
        area: 'Sidi Gaber',
        latitude: 31.2117,
        longitude: 29.9403,
      });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ label: 'Home', isDefault: true, area: 'Sidi Gaber' });

    // Still exactly one address.
    expect(await myAddresses(nanny.token)).toHaveLength(1);

    const profile = await request(app).get('/nanny/profile').set(...authHeader(nanny.token));
    expect(profile.body.data).toMatchObject({ location: '5 Corniche, Alexandria', latitude: 31.2117 });

    const detail = await request(app)
      .get(`/admin/nannies/${nanny.nannyProfileId}`)
      .set(...authHeader(admin.token));
    expect(detail.body.data.address).toMatchObject({ area: 'Sidi Gaber' });

    // Searched from Alexandria she is ~0 km away; from Cairo she is far.
    const fromAlex = await request(app)
      .get('/nanny/nannies')
      .query({ latitude: 31.2117, longitude: 29.9403 })
      .set(...authHeader((await makeMother()).token));
    expect(fromAlex.status).toBe(200);
    const listed = (fromAlex.body.data as Array<{ nannyProfileId: number; distanceKm: number | null }>).find(
      (n) => n.nannyProfileId === nanny.nannyProfileId,
    );
    expect(listed?.distanceKm).toBeLessThan(1);
  });
});
