import { Prisma } from '@prisma/client';

import type { MotherPickerQuery, MotherPickerRow, MotherPickerSortKey, PaginationMeta } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { displayName } from '@backend/lib/display-name';

// Sorting by an aggregate has to happen in the database, before LIMIT/OFFSET —
// sorting one fetched page would order only that page. Hence raw SQL: Prisma's
// query builder can't order users by a sum over their bookings.

const ORDER_BY: Record<MotherPickerSortKey, Prisma.Sql> = {
  name: Prisma.sql`lower(u.first_name || ' ' || u.last_name)`,
  completedBookings: Prisma.sql`completed_bookings`,
  hoursBooked: Prisma.sql`hours_booked`,
  totalSpent: Prisma.sql`total_spent`,
  lastBookingAt: Prisma.sql`last_booking_at`,
  createdAt: Prisma.sql`u.created_at`,
  lastLoginAt: Prisma.sql`u.last_login_at`,
};

type RawRow = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  created_at: Date;
  last_login_at: Date | null;
  completed_bookings: bigint;
  hours_booked: Prisma.Decimal;
  total_spent: Prisma.Decimal;
  last_booking_at: Date | null;
};

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listMotherPicker(
  q: MotherPickerQuery,
): Promise<{ rows: MotherPickerRow[]; meta: PaginationMeta }> {
  const conditions: Prisma.Sql[] = [Prisma.sql`u.role = 'MOTHER'`, Prisma.sql`u.deleted_at IS NULL`];
  if (q.search) {
    const like = `%${escapeLike(q.search)}%`;
    conditions.push(
      Prisma.sql`((u.first_name || ' ' || u.last_name) ILIKE ${like} OR u.phone ILIKE ${like} OR u.email ILIKE ${like})`,
    );
  }
  if (q.groupId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM user_group_members m JOIN user_groups g ON g.id = m.group_id
      WHERE m.user_id = u.id AND m.group_id = ${q.groupId}
        AND m.deleted_at IS NULL AND g.deleted_at IS NULL)`);
  }
  const where = Prisma.join(conditions, ' AND ');
  const dir = q.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const offset = (q.page - 1) * q.limit;

  const [countRows, raw] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM users u WHERE ${where}`,
    prisma.$queryRaw<RawRow[]>`
      SELECT u.id, u.first_name, u.last_name, u.phone, u.created_at, u.last_login_at,
             coalesce(b.completed_bookings, 0) AS completed_bookings,
             coalesce(b.hours_booked, 0) AS hours_booked,
             coalesce(b.total_spent, 0) AS total_spent,
             b.last_booking_at
      FROM users u
      LEFT JOIN (
        SELECT mother_id,
               count(*) AS completed_bookings,
               sum(duration_hours) AS hours_booked,
               sum(total_amount) AS total_spent,
               max(start_time) AS last_booking_at
        FROM bookings
        WHERE status = 'COMPLETED' AND deleted_at IS NULL
        GROUP BY mother_id
      ) b ON b.mother_id = u.id
      WHERE ${where}
      ORDER BY ${ORDER_BY[q.sortBy]} ${dir} NULLS LAST, u.id ASC
      LIMIT ${q.limit} OFFSET ${offset}`,
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  return {
    rows: raw.map((r) => ({
      id: r.id,
      name: displayName(r.first_name, r.last_name),
      phone: r.phone,
      completedBookings: Number(r.completed_bookings),
      hoursBooked: Number(r.hours_booked),
      totalSpent: Number(r.total_spent),
      lastBookingAt: r.last_booking_at ? r.last_booking_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
      lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    })),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}
