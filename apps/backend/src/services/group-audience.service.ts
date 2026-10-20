import { Prisma, Role, UserGroupKind } from '@prisma/client';

import type { DynamicGroupRules } from '@nanny-app/shared';
import { DynamicGroupRulesSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import {
  COMPLETED_BOOKING_STATS_JOIN,
  RECEIVABLE_MOTHER_SQL,
  rulesToSql,
} from '@backend/lib/group-rules-sql';

// ──────────────────────────────────────────────────────────────
// Turns groups into recipients. Feature-neutral: Surveys and the notification
// center both call it, and it imports neither.
// ──────────────────────────────────────────────────────────────

/**
 * Prisma-side twin of RECEIVABLE_MOTHER_SQL: a mother who can receive anything.
 * The single Prisma source — reuse it rather than re-declaring the filter.
 */
export const receivableMotherWhere: Prisma.UserWhereInput = {
  role: Role.MOTHER,
  deletedAt: null,
  isActive: true,
};

/** A stored `user_groups.rules` value, always read through the shared schema. */
export function parseGroupRules(raw: Prisma.JsonValue | null): DynamicGroupRules {
  return DynamicGroupRulesSchema.parse(raw ?? []);
}

/**
 * The union of the groups' current members: live static members plus whoever
 * matches each dynamic group's rules right now. One query over `users`, so a
 * mother in several groups appears once. Only active mothers — the same base
 * filter applies to hand-picked members, who may have been deactivated since.
 * Groups that no longer exist are returned in `skippedGroupIds`.
 */
export async function resolveGroupMembers(
  groupIds: number[],
): Promise<{ userIds: number[]; skippedGroupIds: number[] }> {
  const ids = [...new Set(groupIds)];
  if (ids.length === 0) return { userIds: [], skippedGroupIds: [] };

  const groups = await prisma.userGroup.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, kind: true, rules: true },
  });
  const live = new Set(groups.map((g) => g.id));
  const skippedGroupIds = ids.filter((id) => !live.has(id)).sort((a, b) => a - b);

  const branches: Prisma.Sql[] = [];
  const staticIds = groups.filter((g) => g.kind === UserGroupKind.STATIC).map((g) => g.id);
  if (staticIds.length > 0) {
    branches.push(Prisma.sql`EXISTS (
      SELECT 1 FROM user_group_members m
      WHERE m.user_id = u.id AND m.group_id IN (${Prisma.join(staticIds)}) AND m.deleted_at IS NULL)`);
  }
  for (const group of groups) {
    if (group.kind === UserGroupKind.DYNAMIC) {
      branches.push(Prisma.sql`(${rulesToSql(parseGroupRules(group.rules))})`);
    }
  }
  if (branches.length === 0) return { userIds: [], skippedGroupIds };

  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT u.id
    FROM users u
    ${COMPLETED_BOOKING_STATS_JOIN}
    WHERE (${RECEIVABLE_MOTHER_SQL}) AND (${Prisma.join(branches, ' OR ')})
    ORDER BY u.id ASC`;
  return { userIds: rows.map((r) => r.id), skippedGroupIds };
}

/** How many active mothers a rule set matches right now — a dynamic group's member count. */
export async function countDynamicGroupMembers(rules: DynamicGroupRules): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
    FROM users u
    ${COMPLETED_BOOKING_STATS_JOIN}
    WHERE (${RECEIVABLE_MOTHER_SQL}) AND (${rulesToSql(rules)})`;
  return Number(rows[0]?.total ?? 0);
}
