/**
 * A42 — force update. An admin records releases per platform; the public
 * check (no sign-in needed) tells the app whether it is current, has an
 * optional update, or must update. Deleting the mandatory release lifts the
 * block at once. Only operators with Booking Options access can manage it.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeOperator } from '../../../test/factories';

async function addRelease(
  adminToken: string,
  body: { platform: 'ios' | 'android'; version: string; mandatory?: boolean; releaseNotes?: string },
) {
  const res = await request(app).post('/admin/app-releases').set(...authHeader(adminToken)).send(body);
  expect(res.status).toBe(201);
  return res.body.data as { id: number };
}

function check(platform: string, version: string) {
  return request(app).get('/app-version/check').query({ platform, version });
}

describe('A42 — the public version check', () => {
  it('is ok with nothing recorded, and needs no sign-in', async () => {
    const res = await check('ios', '1.0.0');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok', latestVersion: null, storeUrl: null, releaseNotes: null });
  });

  it('answers required / available / ok by where the version sits, per platform', async () => {
    const admin = await makeAdmin();
    await addRelease(admin.token, { platform: 'ios', version: '1.1.0', mandatory: true });
    await addRelease(admin.token, { platform: 'ios', version: '1.2.0', releaseNotes: 'Chat with your nanny' });

    expect((await check('ios', '1.0.0')).body.data.status).toBe('update_required');
    const available = (await check('ios', '1.1.0')).body.data;
    expect(available).toEqual({
      status: 'update_available',
      latestVersion: '1.2.0',
      storeUrl: 'https://apps.apple.com/app/id6797044436',
      releaseNotes: null,
    });
    expect((await check('ios', '1.2.0')).body.data.status).toBe('ok');
    // Android has nothing recorded, so iOS releases don't touch it.
    expect((await check('android', '1.0.0')).body.data.status).toBe('ok');
  });

  it('lifts the block as soon as the mandatory release is deleted', async () => {
    const admin = await makeAdmin();
    const mandatory = await addRelease(admin.token, { platform: 'android', version: '2.0.0', mandatory: true });
    expect((await check('android', '1.0.0')).body.data.status).toBe('update_required');

    const del = await request(app).delete(`/admin/app-releases/${mandatory.id}`).set(...authHeader(admin.token));
    expect(del.status).toBe(200);

    expect((await check('android', '1.0.0')).body.data.status).toBe('ok');
  });

  it('lifts the block when the release is made optional', async () => {
    const admin = await makeAdmin();
    const release = await addRelease(admin.token, { platform: 'ios', version: '3.0.0', mandatory: true });
    const patched = await request(app)
      .patch(`/admin/app-releases/${release.id}`)
      .set(...authHeader(admin.token))
      .send({ mandatory: false });
    expect(patched.status).toBe(200);

    expect((await check('ios', '2.0.0')).body.data.status).toBe('update_available');
  });

  it('edits only the latest release of a platform', async () => {
    const admin = await makeAdmin();
    const older = await addRelease(admin.token, { platform: 'android', version: '4.0.0' });
    const latest = await addRelease(admin.token, { platform: 'android', version: '4.1.0' });
    const patch = (id: number) =>
      request(app).patch(`/admin/app-releases/${id}`).set(...authHeader(admin.token)).send({ mandatory: true });

    expect((await patch(older.id)).status).toBe(409);
    expect((await patch(latest.id)).status).toBe(200);
  });

  it('fails open on a version that is not x.y.z', async () => {
    const admin = await makeAdmin();
    await addRelease(admin.token, { platform: 'ios', version: '5.0.0', mandatory: true });
    const res = await check('ios', '1.4');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('refuses an unknown platform', async () => {
    expect((await check('web', '1.0.0')).status).toBe(400);
    expect((await check('IOS', '1.0.0')).status).toBe(400);
  });
});

describe('A42 — managing releases', () => {
  it('refuses a duplicate version on the same platform, allows it on the other', async () => {
    const admin = await makeAdmin();
    await addRelease(admin.token, { platform: 'ios', version: '1.0.0' });
    const dup = await request(app)
      .post('/admin/app-releases')
      .set(...authHeader(admin.token))
      .send({ platform: 'ios', version: '1.0.0' });
    expect(dup.status).toBe(409);
    await addRelease(admin.token, { platform: 'android', version: '1.0.0' });
  });

  it('allows re-adding a version after deleting it', async () => {
    const admin = await makeAdmin();
    const first = await addRelease(admin.token, { platform: 'ios', version: '1.0.0' });
    const del = await request(app).delete(`/admin/app-releases/${first.id}`).set(...authHeader(admin.token));
    expect(del.status).toBe(200);
    await addRelease(admin.token, { platform: 'ios', version: '1.0.0' });
  });

  it('gates on Booking Options access: none → 403, VIEW reads, MANAGE writes', async () => {
    const none = await makeOperator({});
    const viewer = await makeOperator({ settings: 'VIEW' });
    const manager = await makeOperator({ settings: 'MANAGE' });

    expect((await request(app).get('/admin/app-releases').set(...authHeader(none.token))).status).toBe(403);
    expect((await request(app).get('/admin/app-releases').set(...authHeader(viewer.token))).status).toBe(200);
    const viewerWrite = await request(app)
      .post('/admin/app-releases')
      .set(...authHeader(viewer.token))
      .send({ platform: 'ios', version: '1.0.0' });
    expect(viewerWrite.status).toBe(403);
    await addRelease(manager.token, { platform: 'ios', version: '1.0.0' });
  });
});
