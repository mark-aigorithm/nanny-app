import { NannyApprovalStatus, Prisma } from '@prisma/client';

import type { AdminNanny, AdminNannyStatusFilter, RejectNannyInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const nannyInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      avatarUrl: true,
      address: true,
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  },
} satisfies Prisma.NannyProfileInclude;

type AdminNannyRow = Prisma.NannyProfileGetPayload<{ include: typeof nannyInclude }>;

function toDto(row: AdminNannyRow): AdminNanny {
  return {
    id: row.id,
    name: `${row.user.firstName} ${row.user.lastName}`.trim(),
    email: row.user.email,
    phone: row.user.phone,
    dateOfBirth: row.user.dateOfBirth
      ? row.user.dateOfBirth.toISOString().slice(0, 10)
      : null,
    avatarUrl: row.user.avatarUrl,
    bio: row.bio,
    // Home location lives on the user row (single source of truth).
    location: row.user.address,
    yearsOfExperience: row.yearsOfExperience,
    hourlyRate: row.hourlyRate?.toNumber() ?? null,
    certifications: row.certifications,
    isEmailVerified: row.user.isEmailVerified,
    isPhoneVerified: row.user.isPhoneVerified,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAdminNannies(
  status: AdminNannyStatusFilter,
): Promise<AdminNanny[]> {
  const rows = await prisma.nannyProfile.findMany({
    where: {
      deletedAt: null,
      user: { deletedAt: null },
      ...(status !== 'ALL' ? { approvalStatus: status as NannyApprovalStatus } : {}),
    },
    include: nannyInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toDto);
}

async function findReviewableNanny(id: string): Promise<AdminNannyRow> {
  const profile = await prisma.nannyProfile.findFirst({
    where: { id, deletedAt: null, user: { deletedAt: null } },
    include: nannyInclude,
  });
  if (!profile) throw errors.notFound('Nanny not found');
  return profile;
}

/**
 * Admin approves a nanny after reviewing her data (KYC): PENDING_REVIEW /
 * REJECTED → APPROVED, then notifies her (in-app + push) that she can start
 * using the app.
 */
export async function approveNanny(id: string): Promise<AdminNanny> {
  const profile = await findReviewableNanny(id);
  if (profile.approvalStatus === NannyApprovalStatus.APPROVED) {
    throw errors.badRequest('This nanny is already approved.');
  }

  const updated = await prisma.nannyProfile.update({
    where: { id },
    data: {
      approvalStatus: NannyApprovalStatus.APPROVED,
      reviewedAt: new Date(),
      rejectionReason: null,
    },
    include: nannyInclude,
  });

  const title = 'Your profile is approved!';
  const body = 'Welcome to NannyNow — you can now sign in and start receiving bookings.';
  await createInAppNotification({
    userId: updated.user.id,
    type: 'NANNY_APPROVED',
    title,
    body,
  });
  await dispatchPush(updated.user.id, {
    title,
    body,
    data: { type: 'nanny_approved', title },
  });

  return toDto(updated);
}

/**
 * Admin rejects a nanny application. The optional reason is stored and shown
 * to the nanny on her pending-review screen.
 */
export async function rejectNanny(id: string, input: RejectNannyInput): Promise<AdminNanny> {
  const profile = await findReviewableNanny(id);
  if (profile.approvalStatus === NannyApprovalStatus.REJECTED) {
    throw errors.badRequest('This nanny is already rejected.');
  }

  const updated = await prisma.nannyProfile.update({
    where: { id },
    data: {
      approvalStatus: NannyApprovalStatus.REJECTED,
      reviewedAt: new Date(),
      rejectionReason: input.reason ?? null,
    },
    include: nannyInclude,
  });

  const title = 'Update on your application';
  const body = input.reason
    ? `Your nanny application was not approved: ${input.reason}`
    : 'Your nanny application was not approved. Please contact support for details.';
  await createInAppNotification({
    userId: updated.user.id,
    type: 'NANNY_REJECTED',
    title,
    body,
  });
  await dispatchPush(updated.user.id, {
    title,
    body,
    data: { type: 'nanny_rejected', title },
  });

  return toDto(updated);
}
