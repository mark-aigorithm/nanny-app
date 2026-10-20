/**
 * The rule → SQL builder behind dynamic groups, the mother picker's `rules`
 * filter and the notification audience. Asserted on the SQL text and the bound
 * values so a refactor can't quietly change what a rule means — in particular
 * that `notWithinDays` keeps the never-set (NULL) mothers in, and that the
 * booking metrics treat "no completed booking" as zero.
 */
import type { DynamicGroupRule } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import {
  COMPLETED_BOOKING_STATS_JOIN,
  RECEIVABLE_MOTHER_SQL,
  ruleToSql,
  rulesToSql,
} from '@backend/lib/group-rules-sql';

/** The statement with `?` placeholders, whitespace collapsed. */
const text = (sql: Prisma.Sql): string => sql.sql.replace(/\s+/g, ' ').trim();

const CUTOFF = 'now() - make_interval(days => ?::int)';

describe('ruleToSql', () => {
  it.each<[string, DynamicGroupRule, string, unknown[]]>([
    [
      'opened the app recently',
      { field: 'lastAppOpenAt', op: 'withinDays', days: 7 },
      `u.last_app_open_at >= ${CUTOFF}`,
      [7],
    ],
    [
      'signed in recently',
      { field: 'lastLoginAt', op: 'withinDays', days: 14 },
      `u.last_login_at >= ${CUTOFF}`,
      [14],
    ],
    [
      'signed up recently',
      { field: 'createdAt', op: 'withinDays', days: 7 },
      `u.created_at >= ${CUTOFF}`,
      [7],
    ],
    [
      'booked recently',
      { field: 'lastBookingAt', op: 'withinDays', days: 30 },
      `b.last_booking_at >= ${CUTOFF}`,
      [30],
    ],
    [
      'signed up long ago',
      { field: 'createdAt', op: 'notWithinDays', days: 90 },
      `(u.created_at IS NULL OR u.created_at < ${CUTOFF})`,
      [90],
    ],
    [
      'at least N completed bookings',
      { field: 'completedBookings', op: 'gte', value: 3 },
      'coalesce(b.completed_bookings, 0) >= ?',
      [3],
    ],
    [
      'at most N completed bookings',
      { field: 'completedBookings', op: 'lte', value: 0 },
      'coalesce(b.completed_bookings, 0) <= ?',
      [0],
    ],
    [
      'spent at least',
      { field: 'totalSpent', op: 'gte', value: 1000 },
      'coalesce(b.total_spent, 0) >= ?',
      [1000],
    ],
    [
      'spent at most',
      { field: 'totalSpent', op: 'lte', value: 500 },
      'coalesce(b.total_spent, 0) <= ?',
      [500],
    ],
  ])('%s', (_label, rule, sql, values) => {
    const built = ruleToSql(rule);
    expect(text(built)).toBe(sql);
    expect(built.values).toEqual(values);
  });

  // Review focus 4: a mother who never opened the app since tracking began, or
  // never booked, must still match "not opened in 30 days" / "no booking in 60 days".
  it.each<[DynamicGroupRule, string, number]>([
    [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }, 'u.last_app_open_at', 30],
    [{ field: 'lastLoginAt', op: 'notWithinDays', days: 60 }, 'u.last_login_at', 60],
    [{ field: 'lastBookingAt', op: 'notWithinDays', days: 60 }, 'b.last_booking_at', 60],
  ])('notWithinDays matches NULL (%j)', (rule, column, days) => {
    const built = ruleToSql(rule);
    expect(text(built)).toBe(`(${column} IS NULL OR ${column} < ${CUTOFF})`);
    expect(built.values).toEqual([days]);
  });
});

describe('rulesToSql', () => {
  it('is TRUE for no rules — every active mother', () => {
    const built = rulesToSql([]);
    expect(text(built)).toBe('TRUE');
    expect(built.values).toEqual([]);
  });

  it('ANDs each rule in its own parentheses, values in order', () => {
    const built = rulesToSql([
      { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
      { field: 'completedBookings', op: 'gte', value: 1 },
    ]);
    expect(text(built)).toBe(
      `((u.last_app_open_at IS NULL OR u.last_app_open_at < ${CUTOFF})) AND (coalesce(b.completed_bookings, 0) >= ?)`,
    );
    expect(built.values).toEqual([30, 1]);
  });
});

describe('shared fragments', () => {
  it('limits recipients to active, non-deleted mothers', () => {
    expect(text(RECEIVABLE_MOTHER_SQL)).toBe(
      "u.role = 'MOTHER' AND u.deleted_at IS NULL AND u.is_active",
    );
    expect(RECEIVABLE_MOTHER_SQL.values).toEqual([]);
  });

  it('aggregates COMPLETED, non-deleted bookings per mother', () => {
    const join = text(COMPLETED_BOOKING_STATS_JOIN);
    expect(join).toMatch(/^LEFT JOIN \(/);
    expect(join).toContain("WHERE status = 'COMPLETED' AND deleted_at IS NULL");
    expect(join).toContain('GROUP BY mother_id');
    expect(join).toContain('count(*) AS completed_bookings');
    expect(join).toContain('sum(total_amount) AS total_spent');
    expect(join).toContain('max(start_time) AS last_booking_at');
    expect(join).toMatch(/\) b ON b\.mother_id = u\.id$/);
  });
});
