import type { BookingChild, Child } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';

type ChildRow = {
  id: number;
  name: string | null;
  ageYears: number;
  createdAt: Date;
};

function toDto(row: ChildRow): Child {
  return {
    id: row.id,
    name: row.name,
    ageYears: row.ageYears,
    createdAt: row.createdAt.toISOString(),
  };
}

/** A mother's saved children, oldest entry first so the order is stable. */
export async function listChildren(userId: number): Promise<Child[]> {
  const rows = await prisma.child.findMany({
    where: { userId, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, ageYears: true, createdAt: true },
  });
  return rows.map(toDto);
}

/**
 * Replaces a mother's saved children with `children`.
 *
 * Replace-all rather than per-row CRUD because that is exactly what the booking
 * sheet means by "save for next booking": this is my family now. It also means
 * no client ever sends a child id, so there is no ownership check to get wrong.
 *
 * Soft-delete then insert, in one transaction — a partial write would leave her
 * with a half-old, half-new family, which is worse than either.
 */
export async function saveChildren(
  userId: number,
  children: BookingChild[],
  tx?: Prisma.TransactionClient,
): Promise<Child[]> {
  const run = async (client: Prisma.TransactionClient): Promise<void> => {
    await client.child.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (children.length > 0) {
      await client.child.createMany({
        data: children.map((c) => ({ userId, name: c.name, ageYears: c.ageYears })),
      });
    }
  };

  // Callers already inside a transaction (createBooking, register) pass theirs
  // in, so saving children can't commit independently of the thing that asked.
  if (tx) {
    await run(tx);
    return listChildrenIn(tx, userId);
  }
  return prisma.$transaction(async (client) => {
    await run(client);
    return listChildrenIn(client, userId);
  });
}

async function listChildrenIn(
  client: Prisma.TransactionClient,
  userId: number,
): Promise<Child[]> {
  const rows = await client.child.findMany({
    where: { userId, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, ageYears: true, createdAt: true },
  });
  return rows.map(toDto);
}
