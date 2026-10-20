/**
 * A36 — the mother picker the console uses to fill groups and pick survey
 * recipients. It sorts by booking activity, so the aggregates must be computed
 * in the database before paging (sorting one page would be wrong), count only
 * COMPLETED bookings, and never list a nanny.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeBooking, makeMother, makeNanny } from '../../../test/factories';

type Row = { id: number; completedBookings: number; hoursBooked: number; totalSpent: number };

async function pick(token: string, query: Record<string, string | number>): Promise<Row[]> {
  const res = await request(app).get('/admin/mother-picker').query(query).set(...authHeader(token));
  expect(res.status).toBe(200);
  return res.body.data as Row[];
}

describe('A36 — mother picker', () => {
  it('sorts by completed bookings and hours, ignoring cancelled ones and nannies', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const busy = await makeMother({ firstName: 'Busy' });
    const some = await makeMother({ firstName: 'Some' });
    const none = await makeMother({ firstName: 'None' });

    await makeBooking({ motherId: busy.id, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED', durationHours: 4 });
    await makeBooking({ motherId: busy.id, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED', durationHours: 4 });
    await makeBooking({ motherId: some.id, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED', durationHours: 6 });
    await makeBooking({ motherId: some.id, nannyProfileId: nanny.nannyProfileId, status: 'CANCELLED', durationHours: 8 });

    const byBookings = await pick(admin.token, { sortBy: 'completedBookings', sortDir: 'desc' });
    expect(byBookings.map((r) => r.id)).toEqual([busy.id, some.id, none.id]);
    expect(byBookings.map((r) => r.completedBookings)).toEqual([2, 1, 0]);

    const byHours = await pick(admin.token, { sortBy: 'hoursBooked', sortDir: 'asc' });
    expect(byHours.map((r) => [r.id, r.hoursBooked])).toEqual([[none.id, 0], [some.id, 6], [busy.id, 8]]);
    expect(byHours.find((r) => r.id === busy.id)!.totalSpent).toBeGreaterThan(0);
  });

  it('pages after sorting, searches by name, and filters to a group', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const amy = await makeMother({ firstName: 'Amy' });
    const bea = await makeMother({ firstName: 'Bea' });
    // Created last, so it has the highest id: only a real sort-before-paging puts it first.
    const top = await makeMother({ firstName: 'Zed' });
    await makeBooking({ motherId: top.id, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED' });

    const firstPage = await pick(admin.token, { sortBy: 'completedBookings', sortDir: 'desc', limit: 1, page: 1 });
    expect(firstPage.map((r) => r.id)).toEqual([top.id]);

    const secondRes = await request(app)
      .get('/admin/mother-picker')
      .query({ sortBy: 'completedBookings', sortDir: 'desc', limit: 1, page: 2 })
      .set(...authHeader(admin.token));
    expect(secondRes.status).toBe(200);
    expect((secondRes.body.data as Row[]).map((r) => r.id)).toEqual([amy.id]);
    expect(secondRes.body.meta).toMatchObject({ total: 3, totalPages: 3 });

    const found = await pick(admin.token, { search: 'ze' });
    expect(found.map((r) => r.id)).toEqual([top.id]);

    const group = await request(app).post('/admin/groups').set(...authHeader(admin.token)).send({ name: 'G' });
    await request(app)
      .post(`/admin/groups/${group.body.data.id}/members`)
      .set(...authHeader(admin.token))
      .send({ userIds: [top.id] });
    const inGroup = await pick(admin.token, { groupId: group.body.data.id });
    expect(inGroup.map((r) => r.id)).toEqual([top.id]);

    // The group's "Add mothers" picker lists only mothers who aren't members yet.
    const notInGroup = await pick(admin.token, { excludeGroupId: group.body.data.id, sortBy: 'name', sortDir: 'asc' });
    expect(notInGroup.map((r) => r.id)).toEqual([amy.id, bea.id]);
  });
});

describe('A36 — mother picker hides deactivated mothers', () => {
  it('never lists an inactive mother, since a publish that includes one is refused', async () => {
    const admin = await makeAdmin();
    const active = await makeMother({ firstName: 'Active' });
    await makeMother({ firstName: 'Inactive', isActive: false });

    const rows = await pick(admin.token, {});
    expect(rows.map((r) => r.id)).toEqual([active.id]);
  });
});
