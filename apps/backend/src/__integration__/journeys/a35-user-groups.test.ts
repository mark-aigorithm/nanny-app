/**
 * A35 — admin-curated groups of mothers, the building block for sending a
 * survey to "Beta testers" rather than to everyone. Groups are hand-picked
 * lists: only mothers can be members, adding is idempotent, removing is a soft
 * delete that adding undoes, and a deleted group's name is free again.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny } from '../../../test/factories';

async function createGroup(token: string, name: string) {
  const res = await request(app).post('/admin/groups').set(...authHeader(token)).send({ name });
  expect(res.status).toBe(201);
  return res.body.data as { id: number; memberCount: number };
}

describe('A35 — user groups', () => {
  it('creates, renames and lists groups, refusing a duplicate live name', async () => {
    const admin = await makeAdmin();
    const group = await createGroup(admin.token, 'Beta testers');

    const dup = await request(app).post('/admin/groups').set(...authHeader(admin.token)).send({ name: 'beta TESTERS' });
    expect(dup.status).toBe(409);

    const renamed = await request(app)
      .patch(`/admin/groups/${group.id}`)
      .set(...authHeader(admin.token))
      .send({ name: 'Early mothers', description: 'First 100' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ name: 'Early mothers', description: 'First 100', memberCount: 0 });

    const list = await request(app).get('/admin/groups').set(...authHeader(admin.token));
    expect(list.body.data.map((g: { name: string }) => g.name)).toEqual(['Early mothers']);
  });

  it('adds mothers idempotently, refuses nannies, and removes by soft delete', async () => {
    const admin = await makeAdmin();
    const [a, b] = [await makeMother(), await makeMother()];
    const nanny = await makeNanny();
    const group = await createGroup(admin.token, 'G');
    const members = `/admin/groups/${group.id}/members`;

    const withNanny = await request(app).post(members).set(...authHeader(admin.token)).send({ userIds: [a.id, nanny.id] });
    expect(withNanny.status).toBe(400);

    const added = await request(app).post(members).set(...authHeader(admin.token)).send({ userIds: [a.id, b.id] });
    expect(added.body.data.memberCount).toBe(2);
    const again = await request(app).post(members).set(...authHeader(admin.token)).send({ userIds: [a.id] });
    expect(again.body.data.memberCount).toBe(2);

    const removed = await request(app).delete(members).set(...authHeader(admin.token)).send({ userIds: [a.id] });
    expect(removed.body.data.memberCount).toBe(1);
    const readded = await request(app).post(members).set(...authHeader(admin.token)).send({ userIds: [a.id] });
    expect(readded.body.data.memberCount).toBe(2);
  });

  it('deletes a group, hiding it and freeing its name', async () => {
    const admin = await makeAdmin();
    const group = await createGroup(admin.token, 'Temp');

    const del = await request(app).delete(`/admin/groups/${group.id}`).set(...authHeader(admin.token));
    expect(del.status).toBe(200);
    expect((await request(app).get(`/admin/groups/${group.id}`).set(...authHeader(admin.token))).status).toBe(404);
    await createGroup(admin.token, 'Temp');
  });
});
