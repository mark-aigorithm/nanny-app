import { type Prisma, Role, UserGroupKind } from '@prisma/client';

import type {
  DynamicGroupRules,
  GroupRulesPreview,
  UserGroup,
  UserGroupInput,
  UserGroupUpdateInput,
} from '@nanny-app/shared';
import { UserGroupInputSchema, UserGroupUpdateSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { countDynamicGroupMembers, parseGroupRules } from '@backend/services/group-audience.service';

const withMemberCount = {
  _count: { select: { members: { where: { deletedAt: null } } } },
} as const;

type GroupRow = {
  id: number;
  name: string;
  description: string | null;
  kind: UserGroupKind;
  rules: Prisma.JsonValue;
  createdAt: Date;
  _count: { members: number };
};

/**
 * A static group counts its member rows; a dynamic group has none — its
 * members are whoever its rules match right now, so the count is live.
 */
async function toDto(row: GroupRow): Promise<UserGroup> {
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.kind === UserGroupKind.DYNAMIC) {
    const rules = parseGroupRules(row.rules);
    return { ...base, kind: 'DYNAMIC', rules, memberCount: await countDynamicGroupMembers(rules) };
  }
  return { ...base, kind: 'STATIC', rules: null, memberCount: row._count.members };
}

async function requireGroup(id: number): Promise<GroupRow> {
  const row = await prisma.userGroup.findFirst({ where: { id, deletedAt: null }, include: withMemberCount });
  if (!row) throw errors.notFound('Group not found.');
  return row;
}

/** Member rows belong to static groups only. */
function assertStatic(row: GroupRow): void {
  if (row.kind === UserGroupKind.DYNAMIC) throw errors.conflict('Dynamic groups have no hand-picked members.');
}

/** Names are unique among live groups, ignoring case. */
async function assertNameFree(name: string, exceptId?: number): Promise<void> {
  const clash = await prisma.userGroup.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw errors.conflict('A group with this name already exists.');
}

export async function listUserGroups(): Promise<UserGroup[]> {
  const rows = await prisma.userGroup.findMany({
    where: { deletedAt: null },
    include: withMemberCount,
    orderBy: { name: 'asc' },
  });
  return Promise.all(rows.map(toDto));
}

export async function getUserGroup(id: number): Promise<UserGroup> {
  return toDto(await requireGroup(id));
}

export async function createUserGroup(adminId: number, input: UserGroupInput): Promise<UserGroup> {
  const { name, description, kind, rules } = UserGroupInputSchema.parse(input);
  await assertNameFree(name);
  const row = await prisma.userGroup.create({
    data: {
      name,
      description,
      kind,
      createdById: adminId,
      // STATIC leaves the column NULL; DYNAMIC always stores an array ([] = every active mother).
      ...(kind === UserGroupKind.DYNAMIC ? { rules: (rules ?? []) as Prisma.InputJsonValue } : {}),
    },
    include: withMemberCount,
  });
  return toDto(row);
}

/** Name, description and — for a dynamic group — its rules. `kind` is fixed at creation. */
export async function updateUserGroup(id: number, input: UserGroupUpdateInput): Promise<UserGroup> {
  const { name, description, rules } = UserGroupUpdateSchema.parse(input);
  const existing = await requireGroup(id);
  if (rules !== undefined && existing.kind !== UserGroupKind.DYNAMIC) {
    throw errors.badRequest('Only dynamic groups have rules.');
  }
  await assertNameFree(name, id);
  const row = await prisma.userGroup.update({
    where: { id },
    data: {
      name,
      description,
      ...(rules !== undefined ? { rules: rules as Prisma.InputJsonValue } : {}),
    },
    include: withMemberCount,
  });
  return toDto(row);
}

export async function deleteUserGroup(id: number): Promise<void> {
  await requireGroup(id);
  await prisma.userGroup.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  assertStatic(await requireGroup(id));
  const ids = [...new Set(userIds)];
  const mothers = await prisma.user.count({ where: { id: { in: ids }, role: Role.MOTHER, deletedAt: null } });
  if (mothers !== ids.length) throw errors.badRequest('Only mothers can be added to a group.');

  await prisma.$transaction([
    // Someone removed earlier comes back on the same row.
    prisma.userGroupMember.updateMany({
      where: { groupId: id, userId: { in: ids }, deletedAt: { not: null } },
      data: { deletedAt: null },
    }),
    prisma.userGroupMember.createMany({
      data: ids.map((userId) => ({ groupId: id, userId })),
      skipDuplicates: true,
    }),
  ]);
  return getUserGroup(id);
}

export async function removeUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  assertStatic(await requireGroup(id));
  await prisma.userGroupMember.updateMany({
    where: { groupId: id, userId: { in: userIds }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return getUserGroup(id);
}

/** The live count for a rule set being edited, before it is saved. */
export async function previewGroupRules(rules: DynamicGroupRules): Promise<GroupRulesPreview> {
  return { count: await countDynamicGroupMembers(rules) };
}
