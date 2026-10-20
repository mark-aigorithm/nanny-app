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

import { prisma } from '@backend/db/prisma';
import {
  countDynamicGroupMembers,
  resolveGroupMembers,
} from '@backend/services/group-audience.service';

import { makeAdmin, makeBooking, makeMother, makeNanny } from '../../../test/factories';
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
