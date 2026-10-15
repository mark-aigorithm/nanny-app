/**
 * A34 — service areas. While at least one area is active, a mother can book
 * only at an address inside one; with none active (or only inactive ones),
 * booking is unrestricted. Her address book says which addresses qualify, and
 * booking options name the areas for the app's note.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeOperator } from '../../../test/factories';
import { createBookingViaApi, wallClockTomorrow } from '../../../test/journeys/booking';

// makeMother places her at 30.0444, 31.2357 (downtown Cairo).
const NEW_CAIRO = {
  type: 'Polygon',
  coordinates: [[[31.40, 29.98], [31.52, 29.98], [31.52, 30.06], [31.40, 30.06], [31.40, 29.98]]],
};
const AROUND_DOWNTOWN = {
  type: 'Polygon',
  coordinates: [[[31.20, 30.02], [31.26, 30.02], [31.26, 30.07], [31.20, 30.07], [31.20, 30.02]]],
};

async function addArea(adminToken: string, name: string, polygon: unknown, isActive = true) {
  const res = await request(app)
    .post('/admin/service-areas')
    .set(...authHeader(adminToken))
    .send({ name, polygon, isActive, source: 'drawn' });
  expect(res.status).toBe(201);
  return res.body.data as { id: number };
}

function bookAt(motherToken: string, addressId: number) {
  return request(app)
    .post('/bookings')
    .set(...authHeader(motherToken))
    .send({
      startTime: wallClockTomorrow(10),
      endTime: wallClockTomorrow(14),
      children: [{ name: null, ageYears: 3, allergies: null }],
      addressId,
    });
}

describe('A34 — booking is limited to active service areas', () => {
  it('books anywhere while no area exists', async () => {
    const mother = await makeMother();
    await expect(createBookingViaApi(mother.token)).resolves.toBeDefined();
    const options = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(options.body.data.serviceAreaNames).toEqual([]);
  });

  it('refuses an address outside every active area, naming the areas', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await addArea(admin.token, 'New Cairo', NEW_CAIRO);

    const res = await bookAt(mother.token, mother.addressId!);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("We don't serve this area yet. We're currently in: New Cairo.");
  });

  it('books at an address inside an active area', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await addArea(admin.token, 'New Cairo', NEW_CAIRO);
    await addArea(admin.token, 'Downtown', AROUND_DOWNTOWN);

    const res = await bookAt(mother.token, mother.addressId!);

    expect(res.status).toBe(201);
  });

  it('stops restricting once the only area is switched off or deleted', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const area = await addArea(admin.token, 'New Cairo', NEW_CAIRO);

    await request(app).patch(`/admin/service-areas/${area.id}`).set(...authHeader(admin.token)).send({ isActive: false });
    expect((await bookAt(mother.token, mother.addressId!)).status).toBe(201);

    const second = await addArea(admin.token, 'New Cairo again', NEW_CAIRO);
    await request(app).delete(`/admin/service-areas/${second.id}`).set(...authHeader(admin.token));
    const list = await request(app).get('/admin/service-areas').set(...authHeader(admin.token));
    expect(list.body.data.map((a: { id: number }) => a.id)).not.toContain(second.id);
    const options = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(options.body.data.serviceAreaNames).toEqual([]);
  });

  it('marks each of her addresses in or out, and names the areas in booking options', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await addArea(admin.token, 'New Cairo', NEW_CAIRO);
    await request(app)
      .post('/addresses')
      .set(...authHeader(mother.token))
      .send({ label: 'Work', formattedAddress: '90th St, New Cairo', latitude: 30.02, longitude: 31.47 });

    const list = await request(app).get('/addresses').set(...authHeader(mother.token));
    const byLabel = Object.fromEntries(
      (list.body.data as Array<{ label: string; inServiceArea: boolean }>).map((a) => [a.label, a.inServiceArea]),
    );
    expect(byLabel).toEqual({ Home: false, Work: true });

    const options = await request(app).get('/bookings/options').set(...authHeader(mother.token));
    expect(options.body.data.serviceAreaNames).toEqual(['New Cairo']);
  });
});

describe('A34 — the console manages areas', () => {
  it('refuses an operator without the section and lets a granted one read', async () => {
    const none = await makeOperator({});
    const viewer = await makeOperator({ serviceAreas: 'VIEW' });

    expect((await request(app).get('/admin/service-areas').set(...authHeader(none.token))).status).toBe(403);
    expect((await request(app).get('/admin/service-areas').set(...authHeader(viewer.token))).status).toBe(200);
    const write = await request(app)
      .post('/admin/service-areas')
      .set(...authHeader(viewer.token))
      .send({ name: 'X', polygon: NEW_CAIRO, source: 'drawn' });
    expect(write.status).toBe(403);
  });

  it('refuses an open outline', async () => {
    const admin = await makeAdmin();
    const res = await request(app)
      .post('/admin/service-areas')
      .set(...authHeader(admin.token))
      .send({ name: 'Bad', polygon: { type: 'Polygon', coordinates: [NEW_CAIRO.coordinates[0]!.slice(0, -1)] }, source: 'drawn' });
    expect(res.status).toBe(400);
  });

  it('lists mothers’ default addresses as bare points', async () => {
    const admin = await makeAdmin();
    await makeMother();
    const res = await request(app).get('/admin/service-areas/mother-pins').set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ latitude: 30.0444, longitude: 31.2357 }]);
  });

  it('looks a name up (Nominatim stubbed — no network in CI)', async () => {
    const admin = await makeAdmin();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([
        { display_name: 'New Cairo', boundingbox: ['29.98', '30.06', '31.40', '31.52'], geojson: NEW_CAIRO },
      ])),
    );
    const res = await request(app)
      .get('/admin/service-areas/lookup')
      .query({ q: 'New Cairo' })
      .set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'osm', displayName: 'New Cairo' });
    jest.restoreAllMocks();
  });
});
