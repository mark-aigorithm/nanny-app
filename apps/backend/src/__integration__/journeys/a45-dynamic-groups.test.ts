/**
 * A45 — dynamic groups. A dynamic group has no member rows: its rules are
 * evaluated against the database at send time. The resolver unions static and
 * dynamic groups into one sorted, deduplicated list of active mothers, and
 * reports groups that were deleted. "Not in N days" includes "never", booking
 * metrics count COMPLETED, non-deleted bookings only, and nannies, deactivated
 * and deleted accounts never match. Surveys resolve groups through the same
 * function, so they can target a dynamic group too.
 */
import type { DynamicGroupRules } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { countDynamicGroupMembers, resolveGroupMembers } from '@backend/services/group-audience.service';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeBooking, makeMother, makeNanny, makeOperator } from '../../../test/factories';
import { createDraft, publish } from '../../../test/journeys/survey';

const DAY = 86_400_000;
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY);

let groupSeq = 0;

/** A dynamic group written straight to the table (the admin API for it is Task 5's). */
async function dynamicGroup(adminId: number, rules: DynamicGroupRules): Promise<number> {
  groupSeq += 1;
  const row = await prisma.userGroup.create({
    data: {
      name: `Dynamic ${groupSeq}`,
      kind: 'DYNAMIC',
      rules: rules as Prisma.InputJsonValue,
      createdById: adminId,
    },
  });
  return row.id;
}

async function staticGroup(adminId: number, userIds: number[]): Promise<number> {
  groupSeq += 1;
  const row = await prisma.userGroup.create({
    data: {
      name: `Static ${groupSeq}`,
      createdById: adminId,
      members: { create: userIds.map((userId) => ({ userId })) },
    },
  });
  return row.id;
}

const members = async (groupIds: number[]): Promise<number[]> =>
  (await resolveGroupMembers(groupIds)).userIds;

describe('A45 — resolving dynamic groups', () => {
  it('notWithinDays matches NULL — a mother who never opened the app is "not opened in 30 days"', async () => {
    const admin = await makeAdmin();
    const never = await makeMother({ lastAppOpenAt: null });
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(45) });
    await makeMother({ lastAppOpenAt: daysAgo(2) });

    const group = await dynamicGroup(admin.id, [
      { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
    ]);

    expect(await members([group])).toEqual([never.id, lapsed.id]);
  });

  it('withinDays leaves out never-set and older timestamps', async () => {
    const admin = await makeAdmin();
    await makeMother({ lastLoginAt: null });
    await makeMother({ lastLoginAt: daysAgo(20) });
    const recent = await makeMother({ lastLoginAt: daysAgo(3) });

    const group = await dynamicGroup(admin.id, [
      { field: 'lastLoginAt', op: 'withinDays', days: 14 },
    ]);

    expect(await members([group])).toEqual([recent.id]);
  });

  it('booking rules count COMPLETED, non-deleted bookings; "no booking in 60 days" includes never-booked', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const recent = await makeMother();
    const old = await makeMother();
    const deletedOnly = await makeMother();
    const cancelledOnly = await makeMother();
    const book = (
      motherId: number,
      status: 'COMPLETED' | 'CANCELLED',
      ago: number,
      deleted = false,
    ) =>
      makeBooking({
        motherId,
        nannyProfileId: nanny.nannyProfileId,
        status,
        date: daysAgo(ago),
        ...(deleted ? { data: { deletedAt: new Date() } } : {}),
      });
    await book(recent.id, 'COMPLETED', 10);
    await book(old.id, 'COMPLETED', 90);
    await book(deletedOnly.id, 'COMPLETED', 3, true);
    await book(cancelledOnly.id, 'CANCELLED', 5);

    const bookedLately = await dynamicGroup(admin.id, [
      { field: 'lastBookingAt', op: 'withinDays', days: 30 },
    ]);
    const lapsed = await dynamicGroup(admin.id, [
      { field: 'lastBookingAt', op: 'notWithinDays', days: 60 },
    ]);

    expect(await members([bookedLately])).toEqual([recent.id]);
    expect(await members([lapsed])).toEqual([old.id, deletedOnly.id, cancelledOnly.id]);
  });

  it('compares completed bookings and spend with "none" as zero, and ANDs every rule', async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const regular = await makeMother();
    const once = await makeMother();
    const newbie = await makeMother({ createdAt: daysAgo(2) });
    const veteran = await makeMother({ createdAt: daysAgo(400) });
    const complete = (motherId: number) =>
      makeBooking({
        motherId,
        nannyProfileId: nanny.nannyProfileId,
        status: 'COMPLETED',
        date: daysAgo(5),
      });
    await complete(regular.id);
    await complete(regular.id);
    const single = await complete(once.id);
    const oneBooking = Number(single.totalAmount);

    expect(
      await members([
        await dynamicGroup(admin.id, [{ field: 'completedBookings', op: 'gte', value: 2 }]),
      ]),
    ).toEqual([regular.id]);
    expect(
      await members([
        await dynamicGroup(admin.id, [{ field: 'completedBookings', op: 'lte', value: 0 }]),
      ]),
    ).toEqual([newbie.id, veteran.id]);
    expect(
      await members([await dynamicGroup(admin.id, [{ field: 'totalSpent', op: 'gte', value: 1 }])]),
    ).toEqual([regular.id, once.id]);
    expect(
      await members([
        await dynamicGroup(admin.id, [
          { field: 'completedBookings', op: 'gte', value: 1 },
          { field: 'totalSpent', op: 'lte', value: oneBooking },
        ]),
      ]),
    ).toEqual([once.id]);
    // Factory mothers are created "now" unless `createdAt` is overridden, so
    // only the 400-day-old account falls outside "signed up in the last 7 days".
    expect(
      await members([
        await dynamicGroup(admin.id, [{ field: 'createdAt', op: 'withinDays', days: 7 }]),
      ]),
    ).toEqual([regular.id, once.id, newbie.id]);
  });

  it('empty rules mean every active mother — never a nanny, a deactivated or a deleted account', async () => {
    const admin = await makeAdmin();
    const active = await makeMother();
    await makeMother({ isActive: false });
    await makeMother({ deletedAt: new Date() });
    await makeNanny();

    const everyone = await dynamicGroup(admin.id, []);

    expect(await members([everyone])).toEqual([active.id]);
    expect(await countDynamicGroupMembers([])).toBe(1);
    expect(
      await countDynamicGroupMembers([{ field: 'completedBookings', op: 'gte', value: 1 }]),
    ).toBe(0);
  });

  it('applies the same base filter to static members', async () => {
    const admin = await makeAdmin();
    const active = await makeMother();
    const deactivated = await makeMother();
    const group = await staticGroup(admin.id, [active.id, deactivated.id]);
    await prisma.user.update({ where: { id: deactivated.id }, data: { isActive: false } });

    expect(await members([group])).toEqual([active.id]);
  });

  it('dedupes a mother matched by two groups', async () => {
    const admin = await makeAdmin();
    const both = await makeMother({ lastAppOpenAt: daysAgo(1) });
    const staticOnly = await makeMother({ lastAppOpenAt: daysAgo(90) });
    const dynamicOnly = await makeMother({ lastAppOpenAt: daysAgo(2) });

    const picked = await staticGroup(admin.id, [both.id, staticOnly.id]);
    const active = await dynamicGroup(admin.id, [
      { field: 'lastAppOpenAt', op: 'withinDays', days: 7 },
    ]);

    const resolved = await resolveGroupMembers([active, picked, active]);
    expect(resolved).toEqual({
      userIds: [both.id, staticOnly.id, dynamicOnly.id],
      skippedGroupIds: [],
    });
  });

  it('skips a deleted group, reports it, and still resolves the rest', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const live = await staticGroup(admin.id, [mother.id]);
    const gone = await dynamicGroup(admin.id, []);
    await prisma.userGroup.update({ where: { id: gone }, data: { deletedAt: new Date() } });

    expect(await resolveGroupMembers([gone, live])).toEqual({
      userIds: [mother.id],
      skippedGroupIds: [gone],
    });
    expect(await resolveGroupMembers([gone])).toEqual({ userIds: [], skippedGroupIds: [gone] });
  });

  it('lets a survey be sent to a dynamic group, resolved at publish', async () => {
    const admin = await makeAdmin();
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(40) });
    await makeMother({ lastAppOpenAt: daysAgo(1) });
    const group = await dynamicGroup(admin.id, [
      { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
    ]);
    const survey = await createDraft(admin.token);

    expect(await publish(admin.token, survey.id, { groupIds: [group] })).toBe(1);
    const recipients = await prisma.surveyRecipient.findMany({ where: { surveyId: survey.id } });
    expect(recipients.map((r) => r.userId)).toEqual([lapsed.id]);
  });
});

function postGroup(token: string, body: object) {
  return request(app).post('/admin/groups').set(...authHeader(token)).send(body);
}

const LAPSED_30: DynamicGroupRules = [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }];

describe('A45 — dynamic groups over the admin API', () => {
  it('creates a dynamic group with a live member count, and edits its rules but never its kind', async () => {
    const admin = await makeAdmin();
    await makeMother({ lastAppOpenAt: daysAgo(40) });
    const drifting = await makeMother({ lastAppOpenAt: daysAgo(1) });

    const created = await postGroup(admin.token, { name: 'Lapsed', kind: 'DYNAMIC', rules: LAPSED_30 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Lapsed', kind: 'DYNAMIC', rules: LAPSED_30, memberCount: 1 });
    const id = created.body.data.id as number;

    // Nothing is written to the group when a mother drifts into its rules.
    await prisma.user.update({ where: { id: drifting.id }, data: { lastAppOpenAt: daysAgo(60) } });
    const fetched = await request(app).get(`/admin/groups/${id}`).set(...authHeader(admin.token));
    expect(fetched.body.data.memberCount).toBe(2);

    const within45: DynamicGroupRules = [{ field: 'lastAppOpenAt', op: 'withinDays', days: 45 }];
    const edited = await request(app)
      .patch(`/admin/groups/${id}`)
      .set(...authHeader(admin.token))
      .send({ name: 'Active-ish', kind: 'STATIC', rules: within45 });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ name: 'Active-ish', kind: 'DYNAMIC', rules: within45, memberCount: 1 });

    const list = await request(app).get('/admin/groups').set(...authHeader(admin.token));
    expect(list.body.data).toEqual([expect.objectContaining({ id, kind: 'DYNAMIC', memberCount: 1 })]);
  });

  it('keeps rules off static groups, at create and at edit', async () => {
    const admin = await makeAdmin();

    expect((await postGroup(admin.token, { name: 'S', kind: 'STATIC', rules: [] })).status).toBe(400);

    const plain = await postGroup(admin.token, { name: 'Beta testers' });
    expect(plain.status).toBe(201);
    expect(plain.body.data).toMatchObject({ kind: 'STATIC', rules: null, memberCount: 0 });

    const res = await request(app)
      .patch(`/admin/groups/${plain.body.data.id}`)
      .set(...authHeader(admin.token))
      .send({ name: 'Beta testers', rules: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only dynamic groups have rules.');
  });

  it('refuses hand-picked members on a dynamic group with 409', async () => {
    const admin = await makeAdmin();
    const mother = await makeMother();
    const group = await postGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const path = `/admin/groups/${group.body.data.id}/members`;

    for (const res of [
      await request(app).post(path).set(...authHeader(admin.token)).send({ userIds: [mother.id] }),
      await request(app).delete(path).set(...authHeader(admin.token)).send({ userIds: [mother.id] }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Dynamic groups have no hand-picked members.');
    }
    expect(await prisma.userGroupMember.count()).toBe(0);
  });

  it('previews a rule set without saving, and refuses a field used twice', async () => {
    const admin = await makeAdmin();
    await makeMother({ lastAppOpenAt: daysAgo(40) });
    await makeMother({ lastAppOpenAt: null });
    await makeMother({ lastAppOpenAt: daysAgo(1) });

    const preview = await request(app)
      .post('/admin/groups/rules-preview')
      .set(...authHeader(admin.token))
      .send({ rules: LAPSED_30 });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toEqual({ count: 2 });

    const twice = await request(app)
      .post('/admin/groups/rules-preview')
      .set(...authHeader(admin.token))
      .send({ rules: [...LAPSED_30, { field: 'lastAppOpenAt', op: 'withinDays', days: 7 }] });
    expect(twice.status).toBe(400);
    expect(twice.body.error).toMatch(/Each rule field can be used once\./);
    expect(await prisma.userGroup.count()).toBe(0);
  });

  it("lists a dynamic group's members through the picker, sorted by last app open", async () => {
    const admin = await makeAdmin();
    const nanny = await makeNanny();
    const never = await makeMother({ lastAppOpenAt: null });
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(40) });
    const older = await makeMother({ lastAppOpenAt: daysAgo(70) });
    await makeMother({ lastAppOpenAt: daysAgo(1) });
    await makeBooking({ motherId: older.id, nannyProfileId: nanny.nannyProfileId, status: 'COMPLETED', date: daysAgo(3) });
    const picker = (query: Record<string, string>) =>
      request(app).get('/admin/mother-picker').query(query).set(...authHeader(admin.token));

    const res = await picker({ rules: JSON.stringify(LAPSED_30), sortBy: 'lastAppOpenAt', sortDir: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([lapsed.id, older.id, never.id]);
    expect(res.body.data[2].lastAppOpenAt).toBeNull();
    expect(res.body.data[0].lastAppOpenAt).toEqual(expect.any(String));
    expect(res.body.meta.total).toBe(3);

    // A booking rule needs the stats join in the count query as well as the page query.
    const booked = await picker({ rules: JSON.stringify([{ field: 'completedBookings', op: 'gte', value: 1 }]) });
    expect(booked.body.data.map((r: { id: number }) => r.id)).toEqual([older.id]);
    expect(booked.body.meta.total).toBe(1);

    expect((await picker({ rules: 'not json' })).status).toBe(400);
    expect((await picker({ rules: JSON.stringify([{ field: 'lastAppOpenAt' }]) })).status).toBe(400);
  });

  it('filters and sorts the Mothers list by last app open', async () => {
    const admin = await makeAdmin();
    const recent = await makeMother({ lastAppOpenAt: daysAgo(2) });
    const lapsed = await makeMother({ lastAppOpenAt: daysAgo(45) });
    const gone = await makeMother({ lastAppOpenAt: daysAgo(120) });
    const never = await makeMother({ lastAppOpenAt: null });
    const ids = async (query: Record<string, string>): Promise<number[]> => {
      const res = await request(app).get('/admin/mothers').query(query).set(...authHeader(admin.token));
      expect(res.status).toBe(200);
      return (res.body.data as { id: number }[]).map((m) => m.id);
    };
    const sorted = (list: number[]) => [...list].sort((a, b) => a - b);

    expect(await ids({ lastAppOpen: 'WITHIN_7' })).toEqual([recent.id]);
    expect(await ids({ lastAppOpen: 'WITHIN_30' })).toEqual([recent.id]);
    expect(sorted(await ids({ lastAppOpen: 'NOT_30' }))).toEqual([lapsed.id, gone.id, never.id]);
    expect(sorted(await ids({ lastAppOpen: 'NOT_90' }))).toEqual([gone.id, never.id]);
    expect(await ids({ lastAppOpen: 'NEVER' })).toEqual([never.id]);
    expect(await ids({ sortBy: 'lastAppOpenAt', sortDir: 'desc' })).toEqual([recent.id, lapsed.id, gone.id, never.id]);
    expect(await ids({ sortBy: 'lastAppOpenAt', sortDir: 'asc' })).toEqual([gone.id, lapsed.id, recent.id, never.id]);

    const row = await request(app).get(`/admin/mothers/${never.id}`).set(...authHeader(admin.token));
    expect(row.body.data.lastAppOpenAt).toBeNull();
  });

  it('lets a notifications manager read groups and pick mothers, but not change groups', async () => {
    const admin = await makeAdmin();
    const manager = await makeOperator({ notifications: 'MANAGE' });
    const viewer = await makeOperator({ notifications: 'VIEW' });
    const group = await postGroup(admin.token, { name: 'Everyone', kind: 'DYNAMIC', rules: [] });
    const as = (token: string) => ({
      get: (path: string) => request(app).get(path).set(...authHeader(token)),
      post: (path: string, body: object) => request(app).post(path).set(...authHeader(token)).send(body),
    });

    expect((await as(manager.token).get('/admin/groups')).status).toBe(200);
    expect((await as(manager.token).get(`/admin/groups/${group.body.data.id}`)).status).toBe(200);
    expect((await as(manager.token).get('/admin/mother-picker')).status).toBe(200);
    expect((await as(manager.token).post('/admin/groups', { name: 'Mine' })).status).toBe(403);
    expect((await as(manager.token).post('/admin/groups/rules-preview', { rules: [] })).status).toBe(403);
    expect((await as(viewer.token).get('/admin/groups')).status).toBe(403);
  });
});
