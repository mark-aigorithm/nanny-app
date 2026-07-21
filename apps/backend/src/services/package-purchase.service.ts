import type { PublicPackage, PurchasePackageInput } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { PAYMOB_INTENTION_TTL_MS } from '@backend/lib/paymob/constants';

const DAY_MS = 24 * 60 * 60 * 1000;

type CatalogRow = {
  id: number;
  name: string;
  description: string | null;
  hours: number;
  price: Prisma.Decimal;
  validityDays: number;
  maxSkills: number;
};

function toPublicDto(row: CatalogRow): PublicPackage {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hours: row.hours,
    price: Number(row.price),
    validityDays: row.validityDays,
    maxSkills: row.maxSkills,
  };
}

/**
 * Mobile catalog: active packages whose catalog offer window hasn't closed.
 * `Package.expiresAt` here is the *offer* end date (when the package stops
 * being purchasable) — not to be confused with `PackagePurchase.expiresAt`,
 * which is when a bought bucket's hours stop being usable.
 */
export async function listActivePackages(): Promise<PublicPackage[]> {
  const now = new Date();
  const rows = await prisma.package.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { price: 'asc' },
  });
  return rows.map(toPublicDto);
}

/**
 * Snapshots the chosen package into a PENDING_PAYMENT purchase row. A later
 * task attaches a Paymob payment; another flips this row to ACTIVE and
 * credits hours once payment is captured (see package-hours.service).
 *
 * Enforces the single-active-package invariant: a parent may hold at most
 * one ACTIVE package with hours remaining at a time. This is the ONLY place
 * that invariant is enforced — every other package-hours code path assumes
 * it already holds. An EXPIRED bucket, or an ACTIVE one that has been fully
 * consumed (hoursRemaining = 0), does NOT block a new purchase.
 *
 * Also blocks a second checkout while a PENDING_PAYMENT purchase is still
 * recent: `creditPurchaseHours` promotes PENDING_PAYMENT → ACTIVE
 * unconditionally, so without this guard a parent could start two checkouts
 * before paying either (both pass the ACTIVE guard above, since neither is
 * ACTIVE yet) and end up with two simultaneous ACTIVE packages once both are
 * paid. The window is bounded by `PAYMOB_INTENTION_TTL_MS` — the same TTL
 * that governs how long a Paymob checkout intention stays usable — so a
 * PENDING_PAYMENT purchase older than that is treated as an abandoned
 * checkout and does NOT block a new purchase (it can never be paid anymore
 * anyway, since its intention has gone stale).
 */
export async function createPackagePurchase(
  firebaseUid: string,
  input: PurchasePackageInput,
): Promise<{ purchaseId: number }> {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user || user.deletedAt) throw errors.notFound('User not found');

  const now = new Date();
  const activeExisting = await prisma.packagePurchase.findFirst({
    where: {
      userId: user.id,
      status: 'ACTIVE',
      deletedAt: null,
      hoursRemaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (activeExisting) {
    throw errors.conflict(
      'You already have an active package. Use it up or wait for it to expire before buying another.',
    );
  }

  const pendingExisting = await prisma.packagePurchase.findFirst({
    where: {
      userId: user.id,
      status: 'PENDING_PAYMENT',
      deletedAt: null,
      createdAt: { gt: new Date(now.getTime() - PAYMOB_INTENTION_TTL_MS) },
    },
  });
  if (pendingExisting) {
    throw errors.conflict(
      'You already have a checkout in progress. Complete it or try again shortly.',
    );
  }

  const pkg = await prisma.package.findFirst({
    where: { id: input.packageId, deletedAt: null, isActive: true },
  });
  if (!pkg) throw errors.notFound('Package not found');
  if (pkg.expiresAt && pkg.expiresAt <= now) throw errors.conflict('Package is no longer offered');

  const purchase = await prisma.packagePurchase.create({
    data: {
      userId: user.id,
      packageId: pkg.id,
      nameSnapshot: pkg.name,
      hoursPurchased: pkg.hours,
      pricePaid: pkg.price,
      maxSkillsSnapshot: pkg.maxSkills,
      hoursRemaining: 0,
      status: 'PENDING_PAYMENT',
      expiresAt: new Date(now.getTime() + pkg.validityDays * DAY_MS),
    },
  });
  return { purchaseId: purchase.id };
}
