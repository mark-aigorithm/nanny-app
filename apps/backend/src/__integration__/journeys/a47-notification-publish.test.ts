/**
 * A47 — publishing a notification template. A publish snapshots the template
 * into a NotificationBroadcast, writes one ANNOUNCEMENT inbox row per mother
 * (linked to the broadcast) unless the channel is push-only, and pushes to
 * every live device unless it is in-app-only. A mother reached through two
 * groups gets one row and one push per device. Publishing is refused, with
 * nothing sent, when the link went bad since saving, when nobody matches, or
 * while another publish of the template is still sending — unless that one has
 * been stuck for over five minutes, when it reads as timed out instead.
 */
import type { Prisma } from '@prisma/client';
import type { BatchResponse } from 'firebase-admin/messaging';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeMother, makeOperator, makePackage, makePromoCode } from '../../../test/factories';
import {
  createTemplate,
  giveDevice,
  publishTemplate,
  spyOnPush,
  templateInput,
} from '../../../test/journeys/notification';

const IMAGE = 'https://cdn.example.com/notifications/win-back.jpg';
const BODY = 'Book a nanny this week and save 20%.';
const BASE = '/admin/notification-templates';
const MINUTE = 60_000;

const announcements = (where: Prisma.NotificationWhereInput = {}) =>
  prisma.notification.count({ where: { type: 'ANNOUNCEMENT', ...where } });

async function makeGroup(token: string, body: object): Promise<number> {
  const res = await request(app).post('/admin/groups').set(...authHeader(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

/** A broadcast another request started at `startedAt` and is (or was) still sending. */
function seedSending(templateId: number, publishedById: number, startedAt: Date) {
  return prisma.notificationBroadcast.create({
    data: {
      templateId,
      publishedById,
      title: 'We miss you',
      body: BODY,
      channel: 'BOTH',
      audience: { type: 'MOTHERS', motherIds: [] },
      status: 'SENDING',
      createdAt: startedAt,
    },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('A47 — publishing a template', () => {
  it('sends in-app and push, linking every inbox row to its broadcast', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const [a, b, c] = [await makeMother(), await makeMother(), await makeMother()];
    const tokenA = await giveDevice(a.id);
    const tokenB = await giveDevice(b.id);
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [a.id, b.id, c.id] }));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({
      templateId: template.id,
      status: 'SENT',
      title: 'We miss you',
      channel: 'BOTH',
      targeted: 3,
      inAppCreated: 3,
      pushSent: 2,
      pushFailed: 0,
      noDevice: 1,
      skippedGroupIds: [],
      error: null,
      publishedBy: { id: admin.id, name: 'Test admin' },
    });
    expect(broadcast.completedAt).toEqual(expect.any(String));

    const rows = await prisma.notification.findMany({ where: { type: 'ANNOUNCEMENT' }, orderBy: { userId: 'asc' } });
    expect(rows.map((r) => [r.userId, r.broadcastId, r.title, r.body, r.isRead])).toEqual(
      [a, b, c].map((m) => [m.id, broadcast.id, 'We miss you', BODY, false]),
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect([...send.mock.calls[0]![0].tokens].sort()).toEqual([tokenA, tokenB].sort());

    const detail = await request(app).get(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(detail.body.data).toMatchObject({ publishCount: 1, lastPublishedAt: broadcast.createdAt });
    const history = await request(app).get(`${BASE}/${template.id}/broadcasts`).set(...authHeader(admin.token));
    expect(history.body.data).toEqual([broadcast]);
  });

  it('push-only writes no inbox row; in-app-only sends no push', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    await giveDevice(mother.id);
    const audience = { type: 'MOTHERS' as const, motherIds: [mother.id] };

    const pushOnly = await createTemplate(admin.token, templateInput(audience, { name: 'Push', channel: 'PUSH' }));
    const pushed = await publishTemplate(admin.token, pushOnly.id);
    expect(pushed).toMatchObject({ status: 'SENT', targeted: 1, inAppCreated: 0, pushSent: 1, noDevice: 0 });
    expect(await announcements()).toBe(0);

    const inboxOnly = await createTemplate(admin.token, templateInput(audience, { name: 'Inbox', channel: 'IN_APP' }));
    const posted = await publishTemplate(admin.token, inboxOnly.id);
    expect(posted).toMatchObject({ status: 'SENT', targeted: 1, inAppCreated: 1, pushSent: 0, pushFailed: 0, noDevice: 0 });
    expect(await announcements({ broadcastId: posted.id })).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a mother in two groups gets one inbox row and one push per device', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const both = await makeMother();
    const other = await makeMother();
    const phone = await giveDevice(both.id);
    const tablet = await giveDevice(both.id);
    const picked = await makeGroup(admin.token, { name: 'Picked' });
    await request(app)
      .post(`/admin/groups/${picked}/members`)
      .set(...authHeader(admin.token))
      .send({ userIds: [both.id] })
      .expect(200);
    const everyone = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const template = await createTemplate(admin.token, templateInput({ type: 'GROUPS', groupIds: [picked, everyone] }));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'SENT', targeted: 2, inAppCreated: 2, pushSent: 2, noDevice: 1 });
    expect(await announcements({ userId: both.id })).toBe(1);
    expect(await announcements({ userId: other.id })).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect([...send.mock.calls[0]![0].tokens].sort()).toEqual([phone, tablet].sort());
  });

  it('carries the link and the image in the push, and snapshots them on the broadcast', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    await giveDevice(mother.id);
    const promo = await makePromoCode({ code: 'SAVE20' });
    const pkg = await makePackage();
    const audience = { type: 'MOTHERS' as const, motherIds: [mother.id] };

    const promoTemplate = await createTemplate(
      admin.token,
      templateInput(audience, { name: 'Promo', imageUrl: IMAGE, targetType: 'PROMO_CODE', promoCodeId: promo.id }),
    );
    const promoSend = await publishTemplate(admin.token, promoTemplate.id);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        notification: { title: 'We miss you', body: BODY, imageUrl: IMAGE },
        android: { notification: { imageUrl: IMAGE } },
        data: { type: 'ANNOUNCEMENT', broadcastId: String(promoSend.id), targetType: 'PROMO_CODE', promoCode: 'SAVE20' },
      }),
    );
    expect(await prisma.notificationBroadcast.findUniqueOrThrow({ where: { id: promoSend.id } })).toMatchObject({
      imageUrl: IMAGE,
      targetType: 'PROMO_CODE',
      packageId: null,
      promoCodeId: promo.id,
      promoCodeText: 'SAVE20',
    });

    const packageTemplate = await createTemplate(
      admin.token,
      templateInput(audience, { name: 'Package', targetType: 'PACKAGE', packageId: pkg.id }),
    );
    const packageSend = await publishTemplate(admin.token, packageTemplate.id);
    const packageMessage = send.mock.calls[1]![0];
    expect(packageMessage.data).toEqual({
      type: 'ANNOUNCEMENT',
      broadcastId: String(packageSend.id),
      targetType: 'PACKAGE',
      packageId: String(pkg.id),
    });
    expect(packageMessage.notification).toEqual({ title: 'We miss you', body: BODY });
    expect(packageMessage.android).toBeUndefined();

    const plain = await createTemplate(admin.token, templateInput(audience, { name: 'Plain' }));
    const plainSend = await publishTemplate(admin.token, plain.id);
    expect(send.mock.calls[2]![0].data).toEqual({ type: 'ANNOUNCEMENT', broadcastId: String(plainSend.id) });
  });

  it('counts a dead token as failed, removes it, and reports PARTIAL', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const a = await makeMother();
    const b = await makeMother();
    const live = await giveDevice(a.id);
    const dead = await giveDevice(b.id);
    send.mockImplementationOnce(async (message) => {
      const response = {
        successCount: 1,
        failureCount: 1,
        responses: message.tokens.map((token) =>
          token === dead
            ? { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'gone' } }
            : { success: true, messageId: 'test-message' },
        ),
      };
      return response as unknown as BatchResponse;
    });
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [a.id, b.id] }));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'PARTIAL', inAppCreated: 2, pushSent: 1, pushFailed: 1, noDevice: 0 });
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: dead } })).deletedAt).not.toBeNull();
    expect((await prisma.deviceToken.findUniqueOrThrow({ where: { token: live } })).deletedAt).toBeNull();
  });

  it('records groups deleted since saving as skipped and still sends to the rest', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const kept = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const dropped = await makeGroup(admin.token, { name: 'Dropped' });
    const template = await createTemplate(admin.token, templateInput({ type: 'GROUPS', groupIds: [kept, dropped] }));
    await request(app).delete(`/admin/groups/${dropped}`).set(...authHeader(admin.token)).expect(200);

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'SENT', targeted: 1, inAppCreated: 1, skippedGroupIds: [dropped] });
    expect(await announcements({ userId: mother.id })).toBe(1);
  });

  it('marks the broadcast FAILED and sends no push when an in-app chunk fails', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    await giveDevice(mother.id);
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    jest.spyOn(prisma.notification, 'createMany').mockRejectedValueOnce(new Error('disk full'));

    const broadcast = await publishTemplate(admin.token, template.id);

    expect(broadcast).toMatchObject({ status: 'FAILED', error: 'disk full', targeted: 1, inAppCreated: 0, pushSent: 0 });
    expect(broadcast.completedAt).toEqual(expect.any(String));
    expect(send).not.toHaveBeenCalled();
  });
});

const PACKAGE_BREAKERS: [string, Prisma.PackageUpdateInput, string][] = [
  ['inactive', { isActive: false }, 'That package is no longer active.'],
  ['expired', { expiresAt: new Date(Date.now() - MINUTE) }, 'That package has expired.'],
  ['deleted', { deletedAt: new Date() }, 'That package no longer exists.'],
];

const PROMO_BREAKERS: [string, Prisma.PromoCodeUpdateInput, string][] = [
  ['inactive', { isActive: false }, 'That promo code is no longer active.'],
  ['expired', { expiresAt: new Date(Date.now() - MINUTE) }, 'That promo code has expired.'],
  ['used up', { maxUsage: 3, usageCount: 3 }, 'That promo code has been used up.'],
  ['deleted', { deletedAt: new Date() }, 'That promo code no longer exists.'],
];

describe('A47 — publish guards', () => {
  it('a second publish while one is sending is refused', async () => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    // Four minutes in: inside the five-minute window, so still "sending".
    await seedSending(template.id, admin.id, new Date(Date.now() - 4 * MINUTE));

    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This notification is already being sent.');
    expect(await prisma.notificationBroadcast.count()).toBe(1);
    expect(await announcements()).toBe(0);
    expect(send).not.toHaveBeenCalled();

    // The guard is per template.
    const other = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { name: 'Other' }));
    expect((await publishTemplate(admin.token, other.id)).status).toBe('SENT');
  });

  it('a stale SENDING broadcast reads as timed out and does not block', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    const stale = await seedSending(template.id, admin.id, new Date(Date.now() - 6 * MINUTE));
    const history = () => request(app).get(`${BASE}/${template.id}/broadcasts`).set(...authHeader(admin.token));

    expect((await history()).body.data).toEqual([
      expect.objectContaining({ id: stale.id, status: 'FAILED', error: 'Timed out', completedAt: null }),
    ]);

    const fresh = await publishTemplate(admin.token, template.id);
    expect(fresh.status).toBe('SENT');

    const after = (await history()).body.data as { id: number; status: string }[];
    expect(after.map((b) => [b.id, b.status])).toEqual([
      [fresh.id, 'SENT'],
      [stale.id, 'FAILED'],
    ]);
    // Only how the stuck row reads changed; the row itself is untouched.
    expect((await prisma.notificationBroadcast.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('SENDING');
  });

  it.each(PACKAGE_BREAKERS)('refuses a package that became %s, creating no broadcast', async (_state, change, message) => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const pkg = await makePackage();
    const template = await createTemplate(
      admin.token,
      templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { targetType: 'PACKAGE', packageId: pkg.id }),
    );
    await prisma.package.update({ where: { id: pkg.id }, data: change });

    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(await prisma.notificationBroadcast.count()).toBe(0);
    expect(await announcements()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(PROMO_BREAKERS)('refuses a promo code that became %s, creating no broadcast', async (_state, change, message) => {
    const send = spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const promo = await makePromoCode();
    const template = await createTemplate(
      admin.token,
      templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { targetType: 'PROMO_CODE', promoCodeId: promo.id }),
    );
    await prisma.promoCode.update({ where: { id: promo.id }, data: change });

    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(message);
    expect(await prisma.notificationBroadcast.count()).toBe(0);
    expect(await announcements()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an audience nobody matches', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const mother = await makeMother();
    const bigSpenders = await makeGroup(admin.token, {
      name: 'Big spenders',
      kind: 'DYNAMIC',
      rules: [{ field: 'completedBookings', op: 'gte', value: 5 }],
    });
    const byGroup = await createTemplate(admin.token, templateInput({ type: 'GROUPS', groupIds: [bigSpenders] }));
    const byHand = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { name: 'By hand' }));
    await prisma.user.update({ where: { id: mother.id }, data: { isActive: false } });

    for (const id of [byGroup.id, byHand.id]) {
      const res = await request(app).post(`${BASE}/${id}/publish`).set(...authHeader(admin.token));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No mothers match this audience.');
    }
    expect(await prisma.notificationBroadcast.count()).toBe(0);
  });

  it('404s a deleted template and refuses a view-only operator', async () => {
    spyOnPush();
    const admin = await makeAdmin();
    const viewer = await makeOperator({ notifications: 'VIEW' });
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));

    expect((await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(viewer.token))).status).toBe(403);

    await request(app).delete(`${BASE}/${template.id}`).set(...authHeader(admin.token)).expect(200);
    const res = await request(app).post(`${BASE}/${template.id}/publish`).set(...authHeader(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Notification template not found.');
    expect(await prisma.notificationBroadcast.count()).toBe(0);
  });
});
