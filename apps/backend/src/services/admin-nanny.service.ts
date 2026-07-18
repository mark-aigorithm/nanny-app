import { BookingStatus, IdVerificationStatus, Prisma } from '@prisma/client';

import type {
  AdminListQuery,
  AdminNanny,
  AdminNannyDetail,
  AdminNannyStatusFilter,
  PaginationMeta,
  RejectNannyInput,
  SetNannySkillsInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
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
      // Identity verification now lives on the user row.
      idVerificationStatus: true,
      idDocumentType: true,
      idRejectionReason: true,
      idReviewedAt: true,
      idDocumentFrontUrl: true,
      idDocumentBackUrl: true,
    },
  },
  nannySkills: {
    where: { deletedAt: null },
    include: { skill: true },
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
    certifications: row.certifications,
    skills: row.nannySkills.map((ns) => ({
      id: ns.skill.id,
      name: ns.skill.name,
      feeType: ns.skill.feeType,
      feeValue: Number(ns.skill.feeValue),
    })),
    isEmailVerified: row.user.isEmailVerified,
    isPhoneVerified: row.user.isPhoneVerified,
    idVerificationStatus: row.user.idVerificationStatus ?? IdVerificationStatus.PENDING_REVIEW,
    idDocumentType: row.user.idDocumentType,
    rejectionReason: row.user.idRejectionReason,
    reviewedAt: row.user.idReviewedAt?.toISOString() ?? null,
    idDocumentFrontUrl: row.user.idDocumentFrontUrl,
    idDocumentBackUrl: row.user.idDocumentBackUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAdminNannies(
  status: AdminNannyStatusFilter,
  { page, limit }: AdminListQuery,
): Promise<{ nannies: AdminNanny[]; meta: PaginationMeta }> {
  const where: Prisma.NannyProfileWhereInput = {
    deletedAt: null,
    user: {
      deletedAt: null,
      ...(status !== 'ALL' ? { idVerificationStatus: status as IdVerificationStatus } : {}),
    },
  };

  const [total, rows] = await prisma.$transaction([
    prisma.nannyProfile.count({ where }),
    prisma.nannyProfile.findMany({
      where,
      include: nannyInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    nannies: rows.map(toDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Full detail for a single nanny (admin detail page): profile + skills, the
 * underlying User id, and lifetime earnings ("amount gained") aggregated from
 * `nannyAmount` across her COMPLETED bookings.
 */
export async function getAdminNanny(id: string): Promise<AdminNannyDetail> {
  const profile = await findReviewableNanny(id);

  const earnings = await prisma.booking.aggregate({
    where: {
      nannyProfileId: id,
      status: BookingStatus.COMPLETED,
      deletedAt: null,
    },
    _sum: { nannyAmount: true },
    _count: true,
  });

  return {
    ...toDto(profile),
    userId: profile.user.id,
    amountGained: earnings._sum.nannyAmount?.toNumber() ?? 0,
    completedBookings: earnings._count,
  };
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
  if (profile.user.idVerificationStatus === IdVerificationStatus.APPROVED) {
    throw errors.badRequest('This nanny is already approved.');
  }

  await prisma.user.update({
    where: { id: profile.user.id },
    data: {
      idVerificationStatus: IdVerificationStatus.APPROVED,
      idReviewedAt: new Date(),
      idRejectionReason: null,
    },
  });

  const title = 'Your profile is approved!';
  const body = 'Welcome to NannyNow — you can now sign in and start receiving bookings.';
  await createInAppNotification({
    userId: profile.user.id,
    type: 'NANNY_APPROVED',
    title,
    body,
  });
  await dispatchPush(profile.user.id, {
    title,
    body,
    data: { type: 'nanny_approved', title },
  });

  return toDto(await findReviewableNanny(id));
}

/**
 * Admin rejects a nanny application. The optional reason is stored and shown
 * to the nanny on her pending-review screen.
 */
export async function rejectNanny(id: string, input: RejectNannyInput): Promise<AdminNanny> {
  const profile = await findReviewableNanny(id);
  if (profile.user.idVerificationStatus === IdVerificationStatus.REJECTED) {
    throw errors.badRequest('This nanny is already rejected.');
  }

  // Clear the ID: null the URLs (in the same write as the status) and best-effort
  // delete the underlying Storage files so the nanny must re-upload.
  const { idDocumentFrontUrl, idDocumentBackUrl } = profile.user;
  await prisma.user.update({
    where: { id: profile.user.id },
    data: {
      idVerificationStatus: IdVerificationStatus.REJECTED,
      idReviewedAt: new Date(),
      idRejectionReason: input.reason ?? null,
      idDocumentFrontUrl: null,
      idDocumentBackUrl: null,
    },
  });
  await deleteStorageObjectByUrl(idDocumentFrontUrl);
  await deleteStorageObjectByUrl(idDocumentBackUrl);

  const title = 'Update on your application';
  const body = input.reason
    ? `Your nanny application was not approved: ${input.reason}`
    : 'Your nanny application was not approved. Please contact support for details.';
  await createInAppNotification({
    userId: profile.user.id,
    type: 'NANNY_REJECTED',
    title,
    body,
  });
  await dispatchPush(profile.user.id, {
    title,
    body,
    data: { type: 'nanny_rejected', title },
  });

  return toDto(await findReviewableNanny(id));
}

/**
 * Replaces a nanny's assigned skills with exactly `skillIds` (admin action).
 * Reconciles the NannySkill join rows in one transaction: soft-deletes rows no
 * longer wanted, reactivates previously soft-deleted ones, and creates the rest.
 * Reactivation (rather than insert) is required because the `@@unique`
 * constraint spans soft-deleted rows too. Unknown or inactive skill ids are
 * rejected so the assignment can never reference a skill parents can't see.
 */
export async function setNannySkills(
  nannyProfileId: string,
  input: SetNannySkillsInput,
): Promise<AdminNanny> {
  const nanny = await prisma.nannyProfile.findFirst({
    where: { id: nannyProfileId, deletedAt: null, user: { deletedAt: null } },
    select: { id: true },
  });
  if (!nanny) throw errors.notFound('Nanny not found');

  const desiredIds = [...new Set(input.skillIds)];
  if (desiredIds.length > 0) {
    const valid = await prisma.skill.findMany({
      where: { id: { in: desiredIds }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (valid.length !== desiredIds.length) {
      throw errors.badRequest('One or more skills are invalid or inactive.');
    }
  }

  await prisma.$transaction(async (tx) => {
    const existingRows = await tx.nannySkill.findMany({
      where: { nannyProfileId },
      select: { id: true, skillId: true, deletedAt: true },
    });
    const desired = new Set(desiredIds);
    const bySkillId = new Map(existingRows.map((r) => [r.skillId, r]));

    // Soft-delete rows that are currently active but no longer wanted.
    const toRemove = existingRows
      .filter((r) => r.deletedAt === null && !desired.has(r.skillId))
      .map((r) => r.id);
    if (toRemove.length > 0) {
      await tx.nannySkill.updateMany({
        where: { id: { in: toRemove } },
        data: { deletedAt: new Date() },
      });
    }

    // Add or reactivate the desired skills.
    for (const skillId of desiredIds) {
      const row = bySkillId.get(skillId);
      if (!row) {
        await tx.nannySkill.create({ data: { nannyProfileId, skillId } });
      } else if (row.deletedAt !== null) {
        await tx.nannySkill.update({ where: { id: row.id }, data: { deletedAt: null } });
      }
    }
  });

  const updated = await prisma.nannyProfile.findUniqueOrThrow({
    where: { id: nannyProfileId },
    include: nannyInclude,
  });
  return toDto(updated);
}
