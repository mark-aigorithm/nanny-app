/**
 * A46 — notification templates: what an admin saves before publishing. A
 * template holds content, channel, an optional package/promo link and an
 * audience (groups, or hand-picked mothers); PATCH replaces it whole. Saving
 * refuses links and audiences that point at nothing or at people who can't
 * receive. The audience preview counts deduplicated mothers and those with a
 * live push device. Deleting is soft; send history is read per template.
 */
import type { NotificationTemplateInput } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import {
  makeAdmin,
  makeMother,
  makeNanny,
  makeOperator,
  makePackage,
  makePromoCode,
} from '../../../test/factories';
import { createTemplate, giveDevice, templateInput } from '../../../test/journeys/notification';

const IMAGE = 'https://cdn.example.com/notifications/win-back.jpg';
const BASE = '/admin/notification-templates';

async function makeGroup(token: string, body: object): Promise<number> {
  const res = await request(app).post('/admin/groups').set(...authHeader(token)).send(body);
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

describe('A46 — notification templates', () => {
  it('creates, reads, lists and fully replaces a template', async () => {
    const admin = await makeAdmin();
    const amal = await makeMother({ firstName: 'Amal' });
    const basma = await makeMother({ firstName: 'Basma' });
    const promo = await makePromoCode({ code: 'SAVE20' });
    const groupId = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });

    const created = await createTemplate(
      admin.token,
      templateInput(
        { type: 'GROUPS', groupIds: [groupId] },
        { imageUrl: IMAGE, targetType: 'PROMO_CODE', promoCodeId: promo.id },
      ),
    );
    expect(created).toMatchObject({
      name: 'Win-back 30d',
      title: 'We miss you',
      body: 'Book a nanny this week and save 20%.',
      imageUrl: IMAGE,
      channel: 'BOTH',
      targetType: 'PROMO_CODE',
      packageId: null,
      promoCodeId: promo.id,
      package: null,
      promoCode: { id: promo.id, code: 'SAVE20' },
      audience: { type: 'GROUPS', groupIds: [groupId] },
      audienceGroups: [{ id: groupId, name: 'Everyone', kind: 'DYNAMIC' }],
      audienceMothers: [],
      publishCount: 0,
      lastPublishedAt: null,
    });

    const fetched = await request(app).get(`${BASE}/${created.id}`).set(...authHeader(admin.token));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data).toEqual(created);

    const list = await request(app).get(BASE).set(...authHeader(admin.token));
    expect(list.body.data).toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'Win-back 30d',
        title: 'We miss you',
        channel: 'BOTH',
        targetType: 'PROMO_CODE',
        linkLabel: 'SAVE20',
        audienceSummary: '1 group',
        publishCount: 0,
        lastPublishedAt: null,
      }),
    ]);

    const replaced = await request(app)
      .patch(`${BASE}/${created.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput({ type: 'MOTHERS', motherIds: [basma.id, amal.id, basma.id] }, { name: 'Renamed', channel: 'PUSH' }));
    expect(replaced.status).toBe(200);
    expect(replaced.body.data).toMatchObject({
      name: 'Renamed',
      channel: 'PUSH',
      imageUrl: null,
      targetType: null,
      promoCodeId: null,
      promoCode: null,
      audienceGroups: [],
    });
    expect([...replaced.body.data.audience.motherIds].sort((x: number, y: number) => x - y)).toEqual([amal.id, basma.id]);
    expect(replaced.body.data.audienceMothers.map((m: { name: string }) => m.name).sort()).toEqual([
      'Amal mother',
      'Basma mother',
    ]);

    const relisted = await request(app).get(BASE).set(...authHeader(admin.token));
    expect(relisted.body.data[0]).toMatchObject({ name: 'Renamed', linkLabel: null, audienceSummary: '2 mothers' });
  });

  it('lists templates most recently updated first', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const audience: NotificationTemplateInput['audience'] = { type: 'MOTHERS', motherIds: [mother.id] };
    const first = await createTemplate(admin.token, templateInput(audience, { name: 'First' }));
    await createTemplate(admin.token, templateInput(audience, { name: 'Second' }));
    const names = async () =>
      ((await request(app).get(BASE).set(...authHeader(admin.token))).body.data as { name: string }[]).map((t) => t.name);

    expect(await names()).toEqual(['Second', 'First']);
    await request(app)
      .patch(`${BASE}/${first.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput(audience, { name: 'First' }))
      .expect(200);
    expect(await names()).toEqual(['First', 'Second']);
  });

  it('refuses an over-long title or body and a link without exactly one target', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const pkg = await makePackage();
    const promo = await makePromoCode();
    const audience: NotificationTemplateInput['audience'] = { type: 'MOTHERS', motherIds: [mother.id] };
    const post = (body: object) => request(app).post(BASE).set(...authHeader(admin.token)).send(body);

    const longTitle = await post(templateInput(audience, { title: 'x'.repeat(66) }));
    expect(longTitle.status).toBe(400);
    expect(longTitle.body.error).toMatch(/^title:/);

    const longBody = await post(templateInput(audience, { body: 'x'.repeat(241) }));
    expect(longBody.status).toBe(400);
    expect(longBody.body.error).toMatch(/^body:/);

    for (const link of [
      { targetType: 'PACKAGE' as const, packageId: pkg.id, promoCodeId: promo.id },
      { targetType: 'PACKAGE' as const, packageId: null, promoCodeId: null },
      { targetType: null, packageId: pkg.id, promoCodeId: null },
    ]) {
      const res = await post(templateInput(audience, link));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('targetType: Pick exactly one package or promo code for this link.');
    }

    expect((await post(templateInput({ type: 'MOTHERS', motherIds: [] }))).status).toBe(400);
    expect(await prisma.notificationTemplate.count()).toBe(0);
  });

  it('refuses a link, group or recipient that no longer exists or cannot receive', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const inactive = await makeMother({ isActive: false });
    const nanny = await makeNanny();
    const deletedPackage = await makePackage({ deletedAt: new Date() });
    const deletedPromo = await makePromoCode({ deletedAt: new Date() });
    const groupId = await makeGroup(admin.token, { name: 'Temp' });
    await request(app).delete(`/admin/groups/${groupId}`).set(...authHeader(admin.token)).expect(200);
    const mothers: NotificationTemplateInput['audience'] = { type: 'MOTHERS', motherIds: [mother.id] };
    const cantReceive = "Some of the chosen people can't receive notifications — only active mothers can.";

    const cases: [NotificationTemplateInput, string][] = [
      [templateInput(mothers, { targetType: 'PACKAGE', packageId: deletedPackage.id }), 'That package no longer exists.'],
      [templateInput(mothers, { targetType: 'PROMO_CODE', promoCodeId: deletedPromo.id }), 'That promo code no longer exists.'],
      [templateInput({ type: 'GROUPS', groupIds: [groupId] }), 'One of the chosen groups no longer exists.'],
      [templateInput({ type: 'MOTHERS', motherIds: [mother.id, nanny.id] }), cantReceive],
      [templateInput({ type: 'MOTHERS', motherIds: [inactive.id] }), cantReceive],
    ];
    for (const [input, message] of cases) {
      const res = await request(app).post(BASE).set(...authHeader(admin.token)).send(input);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(message);
    }

    const valid = await createTemplate(admin.token, templateInput(mothers));
    const patched = await request(app)
      .patch(`${BASE}/${valid.id}`)
      .set(...authHeader(admin.token))
      .send(templateInput(mothers, { name: 'Changed', targetType: 'PACKAGE', packageId: deletedPackage.id }));
    expect(patched.status).toBe(400);
    expect((await request(app).get(`${BASE}/${valid.id}`).set(...authHeader(admin.token))).body.data.name).toBe(
      'Win-back 30d',
    );
    expect(await prisma.notificationTemplate.count()).toBe(1);
  });

  it('refuses an image that is not an https URL', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const res = await request(app)
      .post(BASE)
      .set(...authHeader(admin.token))
      .send(templateInput({ type: 'MOTHERS', motherIds: [mother.id] }, { imageUrl: 'http://cdn.example.com/a.jpg' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The image must be an https URL.');
    expect(await prisma.notificationTemplate.count()).toBe(0);
  });

  it('soft-deletes a template: gone from the list and 404 by id, the row kept', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));

    const del = await request(app).delete(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(del.status).toBe(200);

    expect((await request(app).get(BASE).set(...authHeader(admin.token))).body.data).toEqual([]);
    const gone = await request(app).get(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(gone.status).toBe(404);
    expect(gone.body.error).toBe('Notification template not found.');
    expect((await request(app).delete(`${BASE}/${template.id}`).set(...authHeader(admin.token))).status).toBe(404);
    const row = await prisma.notificationTemplate.findUnique({ where: { id: template.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it('previews the audience: deduplicated mothers, and how many have a live push device', async () => {
    const admin = await makeAdmin();
    const a = await makeMother();
    const b = await makeMother();
    await makeMother();
    const nanny = await makeNanny();
    await giveDevice(a.id);
    await giveDevice(a.id);
    const stale = await giveDevice(b.id);
    await prisma.deviceToken.update({ where: { token: stale }, data: { deletedAt: new Date() } });
    await giveDevice(nanny.id);
    const picked = await makeGroup(admin.token, { name: 'Picked' });
    await request(app)
      .post(`/admin/groups/${picked}/members`)
      .set(...authHeader(admin.token))
      .send({ userIds: [a.id, b.id] })
      .expect(200);
    const everyone = await makeGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const preview = (audience: object) =>
      request(app).post(`${BASE}/audience-preview`).set(...authHeader(admin.token)).send({ audience });

    const groups = await preview({ type: 'GROUPS', groupIds: [picked, everyone] });
    expect(groups.status).toBe(200);
    expect(groups.body.data).toEqual({ mothers: 3, withPushDevice: 1 });

    // A preview filters hand-picked ids instead of refusing them: the nanny just isn't counted.
    const picks = await preview({ type: 'MOTHERS', motherIds: [a.id, nanny.id] });
    expect(picks.body.data).toEqual({ mothers: 1, withPushDevice: 1 });

    expect((await preview({ type: 'GROUPS', groupIds: [] })).status).toBe(400);
  });

  it("lists a template's send history newest first, with who sent it", async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const template = await createTemplate(admin.token, templateInput({ type: 'MOTHERS', motherIds: [mother.id] }));
    const history = () => request(app).get(`${BASE}/${template.id}/broadcasts`).set(...authHeader(admin.token));

    expect((await history()).body.data).toEqual([]);

    const seed = (hoursAgo: number, status: 'SENT' | 'PARTIAL') => {
      const at = new Date(Date.now() - hoursAgo * 3_600_000);
      return prisma.notificationBroadcast.create({
        data: {
          templateId: template.id,
          publishedById: admin.id,
          title: 'We miss you',
          body: 'Book a nanny this week and save 20%.',
          channel: 'BOTH',
          audience: { type: 'MOTHERS', motherIds: [mother.id] },
          status,
          targeted: 1,
          inAppCreated: 1,
          pushSent: status === 'SENT' ? 1 : 0,
          pushFailed: status === 'PARTIAL' ? 1 : 0,
          createdAt: at,
          completedAt: at,
        },
      });
    };
    const older = await seed(2, 'SENT');
    const newer = await seed(1, 'PARTIAL');

    const res = await history();
    expect(res.status).toBe(200);
    expect(res.body.data.map((b: { id: number }) => b.id)).toEqual([newer.id, older.id]);
    expect(res.body.data[0]).toMatchObject({
      templateId: template.id,
      status: 'PARTIAL',
      title: 'We miss you',
      channel: 'BOTH',
      targeted: 1,
      inAppCreated: 1,
      pushSent: 0,
      pushFailed: 1,
      noDevice: 0,
      skippedGroupIds: [],
      error: null,
      publishedBy: { id: admin.id, name: 'Test admin' },
      createdAt: newer.createdAt.toISOString(),
    });

    const detail = await request(app).get(`${BASE}/${template.id}`).set(...authHeader(admin.token));
    expect(detail.body.data).toMatchObject({ publishCount: 2, lastPublishedAt: newer.createdAt.toISOString() });
  });

  it('lets a view-only operator read templates but change nothing', async () => {
    const admin = await makeAdmin();
    const viewer = await makeOperator({ notifications: 'VIEW' });
    const mother = await makeMother();
    const input = templateInput({ type: 'MOTHERS', motherIds: [mother.id] });
    const template = await createTemplate(admin.token, input);
    const as = authHeader(viewer.token);

    expect((await request(app).get(BASE).set(...as)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${template.id}`).set(...as)).status).toBe(200);
    expect((await request(app).get(`${BASE}/${template.id}/broadcasts`).set(...as)).status).toBe(200);
    expect((await request(app).post(BASE).set(...as).send(input)).status).toBe(403);
    expect((await request(app).patch(`${BASE}/${template.id}`).set(...as).send(input)).status).toBe(403);
    expect((await request(app).delete(`${BASE}/${template.id}`).set(...as)).status).toBe(403);
    expect(
      (await request(app).post(`${BASE}/audience-preview`).set(...as).send({ audience: input.audience })).status,
    ).toBe(403);
  });
});
