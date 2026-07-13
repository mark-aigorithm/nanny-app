import { NannyApprovalStatus, Prisma } from '@prisma/client';

import type {
  AdminNanny,
  AdminNannyStatusFilter,
  RejectNannyInput,
  SetNannySkillsInput,
} from '@nanny-app/shared';

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
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    idDocumentFrontUrl: row.idDocumentFrontUrl,
    idDocumentBackUrl: row.idDocumentBackUrl,
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
