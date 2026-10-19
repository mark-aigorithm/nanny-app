import { Role } from '@prisma/client';

import type { UserGroup, UserGroupInput } from '@nanny-app/shared';
import { UserGroupInputSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

const withMemberCount = {
  _count: { select: { members: { where: { deletedAt: null } } } },
} as const;

type GroupRow = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  _count: { members: number };
};

function toDto(row: GroupRow): UserGroup {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    memberCount: row._count.members,
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireGroup(id: number): Promise<GroupRow> {
  const row = await prisma.userGroup.findFirst({ where: { id, deletedAt: null }, include: withMemberCount });
  if (!row) throw errors.notFound('Group not found.');
  return row;
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
  return rows.map(toDto);
}

export async function getUserGroup(id: number): Promise<UserGroup> {
  return toDto(await requireGroup(id));
}

export async function createUserGroup(adminId: number, input: UserGroupInput): Promise<UserGroup> {
  const { name, description } = UserGroupInputSchema.parse(input);
  await assertNameFree(name);
  const row = await prisma.userGroup.create({
    data: { name, description, createdById: adminId },
    include: withMemberCount,
  });
  return toDto(row);
}

export async function updateUserGroup(id: number, input: UserGroupInput): Promise<UserGroup> {
  const { name, description } = UserGroupInputSchema.parse(input);
  await requireGroup(id);
  await assertNameFree(name, id);
  const row = await prisma.userGroup.update({
    where: { id },
    data: { name, description },
    include: withMemberCount,
  });
  return toDto(row);
}

export async function deleteUserGroup(id: number): Promise<void> {
  await requireGroup(id);
  await prisma.userGroup.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  await requireGroup(id);
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
  await requireGroup(id);
  await prisma.userGroupMember.updateMany({
    where: { groupId: id, userId: { in: userIds }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return getUserGroup(id);
}
