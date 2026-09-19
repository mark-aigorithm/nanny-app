import { ApprovalStatus, type Prisma } from '@prisma/client';

import { sortDirection } from '@nanny-app/shared';
import type { AdminIdReview, AdminIdReviewListQuery, PaginationMeta } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const idReviewSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  // The default address row; `location` is its display line.
  addresses: { where: { isDefault: true, deletedAt: null }, take: 1 },
  approvalStatus: true,
  idDocumentType: true,
  rejectionReason: true,
  reviewedAt: true,
  idDocumentFrontUrl: true,
  idDocumentBackUrl: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminIdReviewRow = Prisma.UserGetPayload<{ select: typeof idReviewSelect }>;

function toDto(row: AdminIdReviewRow): AdminIdReview {
  return {
    id: row.id,
    // Drop the "-" placeholder last name (see toMotherDto) from the display name.
    name: `${row.firstName} ${row.lastName === '-' ? '' : row.lastName}`.trim(),
    avatarUrl: row.avatarUrl,
    // Home location is the default address row (single source of truth).
    location: row.addresses[0]?.formattedAddress ?? null,
    idDocumentType: row.idDocumentType,
    idDocumentFrontUrl: row.idDocumentFrontUrl,
    idDocumentBackUrl: row.idDocumentBackUrl,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The parent ID-review gallery: every mother, filterable by approval status
 * and ordered by the caller's `sort` (defaulting to oldest-waiting first —
 * queue order). A parent's approval is exactly an ID check, so the decision
 * is made here; a nanny's approval covers her whole application and is made
 * on her detail page, so nannies are never listed.
 */
export async function listIdReviews(
  { status, page, limit, sort }: AdminIdReviewListQuery,
): Promise<{ reviews: AdminIdReview[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    role: 'MOTHER',
    ...(status !== 'ALL' ? { approvalStatus: status as ApprovalStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: idReviewSelect,
      orderBy: { createdAt: sortDirection(sort) },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    reviews: rows.map(toDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
