import { Prisma } from '@prisma/client';

import type {
  DYNAMIC_RULE_DATE_FIELDS,
  DYNAMIC_RULE_NUMBER_FIELDS,
  DynamicGroupRule,
  DynamicGroupRules,
} from '@nanny-app/shared';

// ──────────────────────────────────────────────────────────────
// SQL for dynamic groups. Every fragment expects `users` aliased `u` and, for
// the booking metrics, COMPLETED_BOOKING_STATS_JOIN aliased `b` in the FROM.
// One builder, used by the group resolver, the dynamic member count and the
// mother picker's `rules` filter, so a rule means the same thing everywhere.
// ──────────────────────────────────────────────────────────────

type DateField = (typeof DYNAMIC_RULE_DATE_FIELDS)[number];
type NumberField = (typeof DYNAMIC_RULE_NUMBER_FIELDS)[number];

/** Who can receive anything: an active, non-deleted mother. Nannies never match. */
export const RECEIVABLE_MOTHER_SQL = Prisma.sql`u.role = 'MOTHER' AND u.deleted_at IS NULL AND u.is_active`;

/**
 * Per-mother booking metrics over COMPLETED, non-deleted bookings only. LEFT
 * JOIN, so a mother with none has NULLs here — the rules coalesce them to 0.
 */
export const COMPLETED_BOOKING_STATS_JOIN = Prisma.sql`LEFT JOIN (
  SELECT mother_id,
         count(*) AS completed_bookings,
         sum(duration_hours) AS hours_booked,
         sum(total_amount) AS total_spent,
         max(start_time) AS last_booking_at
  FROM bookings
  WHERE status = 'COMPLETED' AND deleted_at IS NULL
  GROUP BY mother_id
) b ON b.mother_id = u.id`;

const DATE_COLUMNS: Record<DateField, Prisma.Sql> = {
  lastAppOpenAt: Prisma.sql`u.last_app_open_at`,
  lastLoginAt: Prisma.sql`u.last_login_at`,
  createdAt: Prisma.sql`u.created_at`,
  lastBookingAt: Prisma.sql`b.last_booking_at`,
};

const NUMBER_COLUMNS: Record<NumberField, Prisma.Sql> = {
  completedBookings: Prisma.sql`coalesce(b.completed_bookings, 0)`,
  totalSpent: Prisma.sql`coalesce(b.total_spent, 0)`,
};

function cutoff(days: number): Prisma.Sql {
  return Prisma.sql`now() - make_interval(days => ${days}::int)`;
}

export function ruleToSql(rule: DynamicGroupRule): Prisma.Sql {
  if ('value' in rule) {
    const column = NUMBER_COLUMNS[rule.field];
    return rule.op === 'gte'
      ? Prisma.sql`${column} >= ${rule.value}`
      : Prisma.sql`${column} <= ${rule.value}`;
  }
  const column = DATE_COLUMNS[rule.field];
  if (rule.op === 'withinDays') return Prisma.sql`${column} >= ${cutoff(rule.days)}`;
  // "Not in N days" includes "never": a mother who never opened the app since
  // tracking began is exactly who a win-back message is for.
  return Prisma.sql`(${column} IS NULL OR ${column} < ${cutoff(rule.days)})`;
}

/** The rules AND-ed together; no rules is TRUE ("every active mother"). */
export function rulesToSql(rules: DynamicGroupRules): Prisma.Sql {
  if (rules.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(
    rules.map((rule) => Prisma.sql`(${ruleToSql(rule)})`),
    ' AND ',
  );
}
