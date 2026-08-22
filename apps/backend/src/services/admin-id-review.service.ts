import { IdVerificationStatus, type Prisma } from '@prisma/client';

import { sortDirection } from '@nanny-app/shared';
import type {
  AdminIdReview,
  AdminIdReviewListQuery,
  AdminIdReviewRoleFilter,
  PaginationMeta,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const idReviewSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  avatarUrl: true,
  address: true,
  idVerificationStatus: true,
  idDocumentType: true,
  idRejectionReason: true,
  idReviewedAt: true,
  idDocumentFrontUrl: true,
  idDocumentBackUrl: true,
  createdAt: true,
  // Needed for the action id: nanny approve/reject is keyed by NannyProfile id.
  nannyProfile: { select: { id: true } },
} satisfies Prisma.UserSelect;

type AdminIdReviewRow = Prisma.UserGetPayload<{ select: typeof idReviewSelect }>;

function toDto(row: AdminIdReviewRow): AdminIdReview {
  const role = row.role === 'NANNY' ? 'NANNY' : 'MOTHER';
  // Approve/reject endpoints are keyed differently: NannyProfile id for a nanny,
  // User id for a mother. Fall back to the user id if a profile is somehow absent.
  const actionId = role === 'NANNY' ? row.nannyProfile?.id ?? row.id : row.id;
  return {
    id: actionId,
    userId: row.id,
    role,
    // Drop the "-" placeholder last name (see toMotherDto) from the display name.
    name: `${row.firstName} ${row.lastName === '-' ? '' : row.lastName}`.trim(),
    avatarUrl: row.avatarUrl,
    // Home location lives on the user row (single source of truth).
    location: row.address,
    idDocumentType: row.idDocumentType,
    idDocumentFrontUrl: row.idDocumentFrontUrl,
    idDocumentBackUrl: row.idDocumentBackUrl,
    idVerificationStatus: row.idVerificationStatus,
    rejectionReason: row.idRejectionReason,
    reviewedAt: row.idReviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Role clause for the queue. Nannies must have a live NannyProfile so the
 * approve/reject id (the profile id) actually exists — mirroring the nanny queue,
 * which reads NannyProfile rows directly.
 */
function roleClause(role: AdminIdReviewRoleFilter): Prisma.UserWhereInput {
  const nannyWithProfile: Prisma.UserWhereInput = {
    role: 'NANNY',
    nannyProfile: { is: { deletedAt: null } },
  };
  if (role === 'MOTHER') return { role: 'MOTHER' };
  if (role === 'NANNY') return nannyWithProfile;
  return { OR: [{ role: 'MOTHER' }, nannyWithProfile] };
}

/**
 * Combined KYC review queue for the admin ID-review gallery: parents and nannies
 * in one paginated list, filterable by role and verification status and ordered
 * by the caller's `sort` (defaulting to oldest-waiting first — queue order).
 * Approve/reject stay on the existing per-role endpoints.
 */
export async function listIdReviews(
  { status, role, page, limit, sort }: AdminIdReviewListQuery,
): Promise<{ reviews: AdminIdReview[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...roleClause(role),
    ...(status !== 'ALL' ? { idVerificationStatus: status as IdVerificationStatus } : {}),
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
