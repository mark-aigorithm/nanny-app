/**
 * Package (hours bundle) factory.
 *
 * A round price makes hour-consumption arithmetic in assertions legible:
 * 10 hours for 1000 EGP is 100 EGP/hour at a glance.
 */
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';

/** `packages.name` is unique, so every factory call needs a fresh one. */
let sequence = 0;
function uniqueName(): string {
  sequence += 1;
  return `Test Package ${process.pid}-${sequence}`;
}

export type PackageOverrides = Partial<Prisma.PackageCreateInput>;

export function makePackage(overrides: PackageOverrides = {}) {
  return prisma.package.create({
    data: {
      name: uniqueName(),
      description: 'Factory-created package.',
      hours: 10,
      price: 1000,
      validityDays: 30,
      isActive: true,
      ...overrides,
    },
  });
}
