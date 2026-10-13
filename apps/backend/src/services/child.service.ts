import {
  Role,
  childAgeOn,
  toBookingChild,
  toYearMonth,
  type BookingChild,
  type Child,
  type ChildInput,
  type LegacyChild,
} from '@nanny-app/shared';
import type { Child as ChildRow, Prisma, User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/** More than this and it's not a family a nanny is booked for — it's a typo loop. */
export const MAX_SAVED_CHILDREN = 20;

type Client = Prisma.TransactionClient | typeof prisma;

/** `YYYY-MM` of a stored birth date (a DATE column, so midnight UTC). */
function birthMonthOf(row: ChildRow): string | null {
  return row.birthDate ? toYearMonth(row.birthDate) : null;
}

/** `YYYY-MM` → the first of that month, as the DATE column stores it. */
function birthDateOf(birthMonth: string): Date {
  return new Date(`${birthMonth}-01T00:00:00.000Z`);
}

function toDto(row: ChildRow, today = toYearMonth(new Date())): Child {
  const birthMonth = birthMonthOf(row);
  const age = birthMonth
    ? childAgeOn(birthMonth, today)
    : { ageYears: row.ageYears ?? 0, ageMonths: null };
  return {
    id: row.id,
    name: row.name,
    birthMonth,
    ageYears: age.ageYears,
    ageMonths: age.ageMonths,
    allergies: row.allergies,
    conditions: row.conditions,
    healthNotes: row.healthNotes,
    diet: row.diet,
    interests: row.interests,
    languages: row.languages,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRowData(input: ChildInput) {
  return {
    name: input.name,
    birthDate: birthDateOf(input.birthMonth),
    ageYears: null,
    allergies: input.allergies,
    conditions: input.conditions,
    healthNotes: input.healthNotes,
    diet: input.diet,
    interests: input.interests,
    languages: input.languages,
    notes: input.notes,
  };
}

async function liveRows(client: Client, userId: number): Promise<ChildRow[]> {
  return client.child.findMany({
    where: { userId, deletedAt: null },
    orderBy: { id: 'asc' },
  });
}

/** A mother's saved children, oldest entry first so the order is stable. */
export async function listChildren(userId: number): Promise<Child[]> {
  return (await liveRows(prisma, userId)).map((row) => toDto(row));
}

/** One of her own live children, or a 404 — never "not yours". */
async function requireOwnChild(client: Client, userId: number, id: number): Promise<ChildRow> {
  const row = await client.child.findFirst({ where: { id, userId, deletedAt: null } });
  if (!row) throw errors.notFound('Child not found.');
  return row;
}

export async function createChild(userId: number, input: ChildInput): Promise<Child> {
  const count = await prisma.child.count({ where: { userId, deletedAt: null } });
  if (count >= MAX_SAVED_CHILDREN) {
    throw errors.badRequest(`You can save up to ${MAX_SAVED_CHILDREN} children.`);
  }
  const row = await prisma.child.create({ data: { userId, ...toRowData(input) } });
  return toDto(row);
}

/**
 * Replaces every field of one child. Bookings already made keep their own
 * snapshot, so this never changes what a nanny was told.
 */
export async function updateChild(userId: number, id: number, input: ChildInput): Promise<Child> {
  await requireOwnChild(prisma, userId, id);
  const row = await prisma.child.update({ where: { id }, data: toRowData(input) });
  return toDto(row);
}

/** Soft delete, like addresses. Returns the children left. */
export async function deleteChild(userId: number, id: number): Promise<Child[]> {
  await requireOwnChild(prisma, userId, id);
  await prisma.child.update({ where: { id }, data: { deletedAt: new Date() } });
  return listChildren(userId);
}

/**
 * The snapshot a booking stores for the children she picked, in the order she
 * picked them and aged on the booking's month (`YYYY-MM`, wall-clock).
 *
 * Every id must be one of her own live children. A child saved by an older
 * build without a name or birth month can't be booked until she adds them —
 * the app asks for both before it sends the id, so this is the backstop.
 */
export async function getChildrenForBooking(
  userId: number,
  ids: readonly number[],
  onYearMonth: string,
  client: Client = prisma,
): Promise<BookingChild[]> {
  const rows = await client.child.findMany({
    where: { userId, deletedAt: null, id: { in: [...ids] } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw errors.notFound('Child not found.');
    const child = toDto(row);
    if (!child.name?.trim()) {
      throw errors.badRequest('Add a name for each child before booking.');
    }
    if (!child.birthMonth) {
      throw errors.badRequest(`Add ${child.name}’s birth month before booking.`);
    }
    return toBookingChild(child, onYearMonth);
  });
}

// ── Legacy: /auth/children, for builds older than Profile → Children ──

/**
 * GET /auth/children as those builds read it: allergies as one string, an age
 * in years. Their booking sheet calls `allergies.trim()`, so an array here
 * would crash it.
 */
export async function listLegacyChildren(userId: number): Promise<LegacyChild[]> {
  return (await liveRows(prisma, userId)).map((row) => {
    const dto = toDto(row);
    return {
      id: dto.id,
      name: dto.name,
      ageYears: dto.ageYears,
      allergies: dto.allergies.length > 0 ? dto.allergies.join(', ') : null,
      createdAt: dto.createdAt,
    };
  });
}

/**
 * What an older build's "Save for next booking" does now: add the children she
 * doesn't already have, matched by name (case-insensitive) — or, for an unnamed
 * child, by age among her unnamed ones. It never deletes and never overwrites,
 * because those builds only know name, age and allergies, and replacing the set
 * would wipe everything she has saved since from Profile → Children.
 */
export async function mergeLegacyChildren(
  userId: number,
  children: readonly BookingChild[],
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const run = async (client: Prisma.TransactionClient): Promise<void> => {
    const existing = (await liveRows(client, userId)).map((row) => toDto(row));
    const names = new Set(existing.flatMap((c) => (c.name ? [c.name.trim().toLowerCase()] : [])));
    const unnamedAges = existing.filter((c) => !c.name).map((c) => c.ageYears);
    const room = Math.max(0, MAX_SAVED_CHILDREN - existing.length);

    const toAdd = children.filter((c) => {
      const name = c.name?.trim().toLowerCase();
      if (name) {
        if (names.has(name)) return false;
        names.add(name);
        return true;
      }
      const i = unnamedAges.indexOf(c.ageYears);
      if (i >= 0) {
        unnamedAges.splice(i, 1);
        return false;
      }
      return true;
    });

    if (toAdd.length === 0 || room === 0) return;
    await client.child.createMany({
      data: toAdd.slice(0, room).map((c) => ({
        userId,
        name: c.name?.trim() || null,
        ageYears: c.ageYears,
        allergies: c.allergies?.trim() ? [c.allergies.trim()] : [],
      })),
    });
  };

  // Callers already inside a transaction (createBooking) pass theirs in, so
  // saving children can't commit independently of the thing that asked.
  if (tx) return run(tx);
  await prisma.$transaction(run);
}

// ── The signed-in mother's endpoints ──

async function requireMother(decoded: DecodedIdToken): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }
  // A nanny has no family on file here; letting her write one would just be
  // dead data.
  if (user.role !== Role.MOTHER) {
    throw errors.forbidden('Only mothers can save children.');
  }
  return user;
}

export async function listMyChildren(decoded: DecodedIdToken): Promise<Child[]> {
  return listChildren((await requireMother(decoded)).id);
}

export async function createMyChild(decoded: DecodedIdToken, input: ChildInput): Promise<Child> {
  return createChild((await requireMother(decoded)).id, input);
}

export async function updateMyChild(
  decoded: DecodedIdToken,
  id: number,
  input: ChildInput,
): Promise<Child> {
  return updateChild((await requireMother(decoded)).id, id, input);
}

export async function deleteMyChild(decoded: DecodedIdToken, id: number): Promise<Child[]> {
  return deleteChild((await requireMother(decoded)).id, id);
}
