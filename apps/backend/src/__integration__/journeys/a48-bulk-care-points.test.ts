/**
 * A48 — granting the same Care Points to many mothers at once. Every mother in
 * the audience (hand-picked, or the union of groups) gets the points on her
 * wallet, an ADMIN_GRANT ledger row carrying the reason and the admin, an inbox
 * row saying why, and one push per device. A wallet that already holds points
 * keeps them; a mother who never had a wallet gets one. Nannies and deactivated
 * mothers are never credited, and an operator needs Care Points MANAGE.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeNanny, makeOperator } from '../../../test/factories';
import { grantCarePoints } from '../../../test/journeys/admin';
import { giveDevice, spyOnPush } from '../../../test/journeys/notification';

const REASON = 'Sorry for the app outage on Friday';

function bulkGrant(token: string, body: object) {
  return request(app).post('/admin/rewards/bulk-grant').set(...authHeader(token)).send(body);
}

async function makeGroup(token: string, body: object): Promise<number> {
  const res = await request(app).post('/admin/groups').set(...authHeader(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

const walletOf = (userId: number) => prisma.rewardWallet.findUnique({ where: { userId } });

afterEach(() => {
  jest.restoreAllMocks();
});

describe('A48 — bulk Care Points grant', () => {
  it('credits every chosen mother, records why, and tells each one', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const fresh = await makeMother();
    const holder = await makeMother();
    const left = await makeMother();
    await grantCarePoints(admin.token, holder.id, 30, 'Welcome bonus');
    const phone = await giveDevice(fresh.id);

    const res = await bulkGrant(admin.token, {
      audience: { type: 'MOTHERS', motherIds: [fresh.id, holder.id] },
      points: 50,
      reason: REASON,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ granted: 2, points: 50, skippedGroupIds: [], pushSent: 1, pushFailed: 0 });
    expect(await walletOf(fresh.id)).toMatchObject({ pointsBalance: 50, lifetimeEarned: 50 });
    expect(await walletOf(holder.id)).toMatchObject({ pointsBalance: 80, lifetimeEarned: 80 });
    expect(await walletOf(left.id)).toBeNull();

    const entry = await prisma.rewardLedgerEntry.findFirst({
      where: { userId: holder.id, reason: REASON },
    });
    expect(entry).toMatchObject({ type: 'ADMIN_GRANT', points: 50, balanceAfter: 80, adminId: admin.id });

    const inbox = await prisma.notification.findMany({ where: { type: 'POINTS_GRANTED', body: { contains: REASON } } });
    expect(inbox.map((n) => n.userId).sort()).toEqual([fresh.id, holder.id].sort());
    expect(inbox[0]).toMatchObject({
      title: 'You received Care Points',
      body: `You've been given 50 Care Points: ${REASON}`,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].tokens).toEqual([phone]);
    expect(send.mock.calls[0]![0].data).toMatchObject({ type: 'points_granted' });
  });

  it('grants once to a mother in two groups, and never to a nanny', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const both = await makeMother();
    const other = await makeMother();
    const nanny = await makeNanny();
    const picked = await makeGroup(admin.token, { name: 'Picked' });
    await request(app)
      .post(`/admin/groups/${picked}/members`)
      .set(...authHeader(admin.token))
      .send({ userIds: [both.id] })
      .expect(200);
    const everyone = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });

    const res = await bulkGrant(admin.token, {
      audience: { type: 'GROUPS', groupIds: [picked, everyone] },
      points: 20,
      reason: REASON,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.granted).toBe(2);
    expect(await walletOf(both.id)).toMatchObject({ pointsBalance: 20 });
    expect(await walletOf(other.id)).toMatchObject({ pointsBalance: 20 });
    expect(await walletOf(nanny.id)).toBeNull();
    expect(await prisma.rewardLedgerEntry.count({ where: { userId: both.id } })).toBe(1);
  });

  it('refuses a revoke, an empty reason and an audience nobody is in, crediting no one', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    await prisma.user.update({ where: { id: mother.id }, data: { isActive: false } });
    const active = await makeMother();

    const revoke = await bulkGrant(admin.token, {
      audience: { type: 'MOTHERS', motherIds: [active.id] },
      points: -10,
      reason: REASON,
    });
    expect(revoke.status).toBe(400);

    const blank = await bulkGrant(admin.token, {
      audience: { type: 'MOTHERS', motherIds: [active.id] },
      points: 10,
      reason: '   ',
    });
    expect(blank.status).toBe(400);

    const nobody = await bulkGrant(admin.token, {
      audience: { type: 'MOTHERS', motherIds: [mother.id] },
      points: 10,
      reason: REASON,
    });
    expect(nobody.status).toBe(400);
    expect(nobody.body.error).toBe('Nobody in this audience can receive Care Points.');

    expect(await prisma.rewardLedgerEntry.count()).toBe(0);
  });

  it('lets a Care Points manager grant and count, and refuses a viewer', async () => {
    spyOnPush();
    const mother = await makeMother();
    const manager = await makeOperator({ rewards: 'MANAGE' });
    const viewer = await makeOperator({ rewards: 'VIEW' });
    const audience = { type: 'MOTHERS', motherIds: [mother.id] };

    const preview = await request(app)
      .post('/admin/rewards/bulk-grant/audience-preview')
      .set(...authHeader(manager.token))
      .send({ audience });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toEqual({ mothers: 1, withPushDevice: 0 });

    // Choosing the audience needs the groups list and the mother picker.
    await request(app).get('/admin/groups').set(...authHeader(manager.token)).expect(200);
    await request(app).get('/admin/mother-picker').set(...authHeader(manager.token)).expect(200);

    expect((await bulkGrant(viewer.token, { audience, points: 10, reason: REASON })).status).toBe(403);
    expect((await bulkGrant(manager.token, { audience, points: 10, reason: REASON })).status).toBe(200);
  });
});
