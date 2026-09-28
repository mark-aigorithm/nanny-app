import type {
  AdminPackagePurchase,
  AdminPackagePurchaseDetail,
  AdminPackagePurchaseListQuery,
  AdminPackagePurchaseSortKey,
  AdminSortDir,
  PackageHoursLedgerEntry,
  PaginationMeta,
} from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

const round2 = (n: number) => Math.round(n * 100) / 100;

type PurchaseWithUser = {
  id: number;
  hoursPurchased: number;
  hoursRemaining: Prisma.Decimal;
  pricePaid: Prisma.Decimal;
  status: AdminPackagePurchase['status'];
  purchasedAt: Date | null;
  expiresAt: Date | null;
  nameSnapshot: string;
  user: { firstName: string; lastName: string; email: string };
};

function toPurchaseDto(r: PurchaseWithUser): AdminPackagePurchase {
  const hoursRemaining = Number(r.hoursRemaining);
  return {
    id: r.id,
    buyerName: `${r.user.firstName} ${r.user.lastName}`.trim(),
    buyerEmail: r.user.email,
    packageName: r.nameSnapshot,
    hoursPurchased: r.hoursPurchased,
    hoursRemaining,
    hoursConsumed: round2(Math.max(0, r.hoursPurchased - hoursRemaining)),
    pricePaid: Number(r.pricePaid),
    status: r.status,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

/** Column sort → Prisma order for the admin Package Purchases list. */
function purchaseOrderBy(
  sortBy: AdminPackagePurchaseSortKey,
  sortDir: AdminSortDir,
): Prisma.PackagePurchaseOrderByWithRelationInput[] {
  const orders: Record<
    AdminPackagePurchaseSortKey,
    Prisma.PackagePurchaseOrderByWithRelationInput[]
  > = {
    // The ID column: the id tiebreak below is the whole order.
    id: [],
    buyer: [{ user: { firstName: sortDir } }, { user: { lastName: sortDir } }],
    package: [{ nameSnapshot: sortDir }],
    // The Hours column reads "remaining / purchased".
    hours: [{ hoursRemaining: sortDir }, { hoursPurchased: sortDir }],
    price: [{ pricePaid: sortDir }],
    status: [{ status: sortDir }],
    // When the purchase was started — the order the list has always shown, and
    // it keeps unpaid purchases (no purchasedAt yet) where they began.
    purchased: [{ createdAt: sortDir }],
    // A purchase with no expiry yet (unpaid) sorts last either way.
    expires: [{ expiresAt: { sort: sortDir, nulls: 'last' } }],
  };
  // The id tiebreak keeps equal rows in a fixed order, so pages never overlap.
  return [...orders[sortBy], { id: sortDir }];
}

/**
 * Paginated package purchases for the admin Packages page, filtered by status
 * and buyer search, sorted by whichever column the console last clicked
 * (newest purchases first by default).
 */
export async function listPackagePurchases(
  query: AdminPackagePurchaseListQuery,
): Promise<{ purchases: AdminPackagePurchase[]; meta: PaginationMeta }> {
  const { page, limit, status, search, sortBy, sortDir } = query;
  const where: Prisma.PackagePurchaseWhereInput = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          user: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.packagePurchase.count({ where }),
    prisma.packagePurchase.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: purchaseOrderBy(sortBy, sortDir),
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    purchases: rows.map(toPurchaseDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPackagePurchaseDetail(id: number): Promise<AdminPackagePurchaseDetail> {
  const row = await prisma.packagePurchase.findFirst({
    where: { id, deletedAt: null },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!row) throw errors.notFound('Package purchase not found');

  const entries = await prisma.packageHoursLedger.findMany({
    where: { purchaseId: id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const ledger: PackageHoursLedgerEntry[] = entries.map((e) => ({
    id: e.id,
    type: e.type,
    hours: Number(e.hours),
    balanceAfter: Number(e.balanceAfter),
    reason: e.reason,
    bookingId: e.bookingId,
    createdAt: e.createdAt.toISOString(),
  }));
  return { ...toPurchaseDto(row), ledger };
}
