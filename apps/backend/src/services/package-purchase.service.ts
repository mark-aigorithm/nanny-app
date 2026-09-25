import type { PublicPackage, PurchasePackageInput } from '@nanny-app/shared';
import { PaymentStatus, type Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { PACKAGE_CHECKOUT_OPEN_MS } from '@backend/lib/paymob/constants';

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
 * Never leaves two checkouts payable at once: `creditPurchaseHours` promotes
 * PENDING_PAYMENT → ACTIVE unconditionally, so two open checkouts (both pass
 * the ACTIVE guard, since neither is ACTIVE yet) would end up as two ACTIVE
 * packages once both were paid. So while a checkout is open — a PENDING
 * payment inside `PACKAGE_CHECKOUT_OPEN_MS`, which outlasts the Paymob link —
 * buying the same package again returns that purchase to resume, and buying a
 * different one is refused until the parent pays or cancels it
 * (`cancelPackageCheckout`). It is refused rather than cancelled here because
 * only the cancel path asks Paymob first: a checkout silently dropped while its
 * link could still take money would lose a late payment. An older
 * PENDING_PAYMENT purchase is an abandoned checkout and is ignored.
 */
export async function createPackagePurchase(
  firebaseUid: string,
  input: PurchasePackageInput,
): Promise<{ purchaseId: number }> {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user || user.deletedAt) throw errors.notFound('User not found');

  // Checked here, before any row is written. Paymob needs a phone number, and
  // discovering that only at intention time stranded a PENDING_PAYMENT purchase
  // that then blocked the parent's own retry.
  if (!user.phone) {
    throw errors.badRequest('Add a phone number to your profile before paying.');
  }

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

  // A checkout is open while its latest payment attempt is PENDING and its
  // Paymob link can still take money. Closing the app on the checkout leaves
  // exactly that behind — Paymob never learns the parent left.
  const liveCheckout = await prisma.packagePurchase.findFirst({
    where: {
      userId: user.id,
      status: 'PENDING_PAYMENT',
      deletedAt: null,
      payments: {
        some: {
          status: PaymentStatus.PENDING,
          deletedAt: null,
          createdAt: { gt: new Date(now.getTime() - PACKAGE_CHECKOUT_OPEN_MS) },
        },
      },
    },
    orderBy: { id: 'desc' },
  });
  if (liveCheckout) {
    // Same package: resume it. The intention step hands back the still-live
    // Paymob session instead of opening a second one.
    if (liveCheckout.packageId === input.packageId) return { purchaseId: liveCheckout.id };

    throw errors.conflict(
      `You have an unfinished checkout for ${liveCheckout.nameSnapshot}. Complete or cancel it first.`,
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
