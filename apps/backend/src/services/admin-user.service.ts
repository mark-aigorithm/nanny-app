import { IdVerificationStatus, type Prisma } from '@prisma/client';

import { hasSectionAccess } from '@nanny-app/shared';
import type {
  AdminListQuery,
  AdminMother,
  AdminMotherDetail,
  AdminMotherStatusFilter,
  AdminRole,
  AdminSection,
  AdminUser,
  CreateAdminInput,
  PaginationMeta,
  RejectNannyInput,
  UpdateAdminMotherInput,
  UpdateAdminUserInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { effectivePermissions } from '@backend/lib/admin-permissions';
import { errors } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const motherSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  address: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  isActive: true,
  // Identity verification (mothers are reviewed the same way as nannies).
  idVerificationStatus: true,
  idDocumentType: true,
  idRejectionReason: true,
  idReviewedAt: true,
  idDocumentFrontUrl: true,
  idDocumentBackUrl: true,
  createdAt: true,
  _count: { select: { bookingsAsMother: true } },
} satisfies Prisma.UserSelect;

type AdminMotherRow = Prisma.UserGetPayload<{ select: typeof motherSelect }>;

function toMotherDto(row: AdminMotherRow): AdminMother {
  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName === '-' ? '' : row.lastName}`.trim(),
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    // Home location lives on the user row (single source of truth).
    location: row.address,
    isEmailVerified: row.isEmailVerified,
    isPhoneVerified: row.isPhoneVerified,
    isActive: row.isActive,
    idVerificationStatus: row.idVerificationStatus,
    idDocumentType: row.idDocumentType,
    rejectionReason: row.idRejectionReason,
    reviewedAt: row.idReviewedAt?.toISOString() ?? null,
    idDocumentFrontUrl: row.idDocumentFrontUrl,
    idDocumentBackUrl: row.idDocumentBackUrl,
    bookingCount: row._count.bookingsAsMother,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Loads a reviewable mother row (existing, not soft-deleted) or throws 404. */
async function findReviewableMother(id: number): Promise<AdminMotherRow> {
  const row = await prisma.user.findFirst({
    where: { id, role: 'MOTHER', deletedAt: null },
    select: motherSelect,
  });
  if (!row) throw errors.notFound('Mother not found');
  return row;
}

/** Detail DTO: the list fields plus the raw first/last name split for the edit form. */
function toMotherDetailDto(row: AdminMotherRow): AdminMotherDetail {
  return {
    ...toMotherDto(row),
    firstName: row.firstName,
    lastName: row.lastName,
  };
}

/** Roles that can sign in to the admin console. */
const CONSOLE_ROLES = ['ADMIN', 'SUPERUSER', 'OPERATOR'] as const;

const adminUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  adminPermissions: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type AdminUserRow = Omit<
  Prisma.UserGetPayload<{ select: typeof adminUserSelect }>,
  'role'
> & { role: AdminRole };

function toDto(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    // "-" is the placeholder last name used when an admin is created
    // from a single-word name — hide it in the display name.
    name: `${row.firstName} ${row.lastName === '-' ? '' : row.lastName}`.trim(),
    email: row.email,
    role: row.role,
    // ADMIN/SUPERUSER get the full map so the console can gate on one field
    // regardless of role, instead of special-casing them in the UI.
    permissions: effectivePermissions(row.role, row.adminPermissions),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Profile of the calling account — the console gates its whole UI on this. */
export async function getAdminProfile(firebaseUid: string): Promise<AdminUser> {
  const row = await prisma.user.findFirst({
    where: { firebaseUid, deletedAt: null, role: { in: [...CONSOLE_ROLES] } },
    select: adminUserSelect,
  });
  if (!row) throw errors.forbidden('Admin access required');
  return toDto(row as AdminUserRow);
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, role: { in: [...CONSOLE_ROLES] } },
    select: adminUserSelect,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => toDto(row as AdminUserRow));
}

/**
 * Ids of the console accounts that may view a section — the recipient list for
 * admin-facing notifications. An operator without the section isn't told about
 * work they can't open.
 */
export async function listConsoleUserIdsForSection(section: AdminSection): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, role: { in: [...CONSOLE_ROLES] } },
    select: { id: true, role: true, adminPermissions: true },
  });
  return rows
    .filter((row) => {
      const role = row.role as AdminRole;
      return hasSectionAccess(role, effectivePermissions(role, row.adminPermissions), section, 'VIEW');
    })
    .map((row) => row.id);
}

/** Loads a manageable console account, refusing the root account and 404ing otherwise. */
async function findManageableAdmin(id: number): Promise<AdminUserRow> {
  const row = await prisma.user.findFirst({
    where: { id, deletedAt: null, role: { in: [...CONSOLE_ROLES] } },
    select: adminUserSelect,
  });
  if (!row) throw errors.notFound('Account not found');
  if (row.role === 'SUPERUSER') {
    throw errors.forbidden('The superuser account cannot be modified here.');
  }
  return row as AdminUserRow;
}

/**
 * Superuser edits an admin/operator: rename, re-scope an operator's sections,
 * or suspend the account. Permissions are only meaningful for an OPERATOR —
 * sending them for a full ADMIN is a no-op rather than an error, so the console
 * can submit one payload shape.
 */
export async function updateAdminUser(
  id: number,
  input: UpdateAdminUserInput,
): Promise<AdminUser> {
  const existing = await findManageableAdmin(id);

  const [firstName, ...rest] = (input.name ?? '').trim().split(/\s+/);
  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { firstName: firstName ?? '', lastName: rest.join(' ') || '-' }),
      ...(input.permissions !== undefined &&
        existing.role === 'OPERATOR' && { adminPermissions: input.permissions }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: adminUserSelect,
  });
  return toDto(row as AdminUserRow);
}

/**
 * Superuser removes an admin/operator: soft-delete here (the repo never hard
 * deletes) plus disabling the Firebase account, so an existing session can't
 * keep working off a token that hasn't expired yet.
 */
export async function deleteAdminUser(id: number, actingUserId: number): Promise<void> {
  if (id === actingUserId) throw errors.badRequest('You cannot remove your own account.');
  await findManageableAdmin(id);

  const row = await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
    select: { firebaseUid: true },
  });
  await firebaseAuth.updateUser(row.firebaseUid, { disabled: true });
}

/** Paginated directory of mother (parent) accounts for the admin Users page. */
export async function listAdminMothers(
  status: AdminMotherStatusFilter,
  { page, limit }: AdminListQuery,
): Promise<{ mothers: AdminMother[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    role: 'MOTHER',
    deletedAt: null,
    ...(status !== 'ALL' ? { idVerificationStatus: status as IdVerificationStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: motherSelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    mothers: rows.map(toMotherDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Full detail for a single mother account (admin detail page). */
export async function getAdminMother(id: number): Promise<AdminMotherDetail> {
  return toMotherDetailDto(await findReviewableMother(id));
}

/**
 * Admin approves a mother's ID after review. Since mothers can already book
 * while PENDING_REVIEW, this is confirmatory: PENDING_REVIEW/REJECTED → APPROVED.
 */
export async function approveMother(id: number): Promise<AdminMother> {
  const mother = await findReviewableMother(id);
  if (mother.idVerificationStatus === IdVerificationStatus.APPROVED) {
    throw errors.badRequest('This mother is already approved.');
  }

  await prisma.user.update({
    where: { id },
    data: {
      idVerificationStatus: IdVerificationStatus.APPROVED,
      idReviewedAt: new Date(),
      idRejectionReason: null,
    },
  });

  const title = 'Your ID is verified';
  const body = 'Thanks — your identity has been verified. You can keep booking with NannyNow.';
  await createInAppNotification({ userId: id, type: 'NANNY_APPROVED', title, body });
  await dispatchPush(id, { title, body, data: { type: 'id_approved', title } });

  return toMotherDto(await findReviewableMother(id));
}

/**
 * Admin rejects a mother's ID: clears the images (URLs + Storage files) and sets
 * REJECTED so she is prompted to re-upload before her next booking.
 */
export async function rejectMother(id: number, input: RejectNannyInput): Promise<AdminMother> {
  const mother = await findReviewableMother(id);
  if (mother.idVerificationStatus === IdVerificationStatus.REJECTED) {
    throw errors.badRequest('This mother is already rejected.');
  }

  const { idDocumentFrontUrl, idDocumentBackUrl } = mother;
  await prisma.user.update({
    where: { id },
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

  const title = 'Action needed: re-upload your ID';
  const body = input.reason
    ? `Your ID could not be verified: ${input.reason}. Please upload a new one before booking.`
    : 'Your ID could not be verified. Please upload a new one before booking.';
  await createInAppNotification({ userId: id, type: 'NANNY_REJECTED', title, body });
  await dispatchPush(id, { title, body, data: { type: 'id_rejected', title } });

  return toMotherDto(await findReviewableMother(id));
}

/**
 * Partial update of a mother account from the admin console. Only name and the
 * `isActive` flag are editable — email/phone (Firebase Auth identity),
 * verification flags, and address (tied to matching coordinates) are not touched.
 */
export async function updateAdminMother(
  id: number,
  input: UpdateAdminMotherInput,
): Promise<AdminMotherDetail> {
  // Guard existence + role here: prisma.update can only filter by unique id, so it
  // can't scope to MOTHER / non-deleted on its own.
  const existing = await prisma.user.findFirst({
    where: { id, role: 'MOTHER', deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw errors.notFound('Mother not found');

  const row = await prisma.user.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      // Empty last name → '-' placeholder (the display name drops it — see toMotherDto).
      ...(input.lastName !== undefined && {
        lastName: input.lastName === '' ? '-' : input.lastName,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: motherSelect,
  });
  return toMotherDetailDto(row);
}

/**
 * Superuser creates a console account: Firebase Auth account + user row.
 * An ADMIN gets the whole console; an OPERATOR gets only the sections in
 * `permissions`, stored on the row and enforced by `requireSectionAccess`.
 */
export async function createAdminUser(input: CreateAdminInput): Promise<AdminUser> {
  const email = input.email.toLowerCase();

  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing) throw errors.conflict('A user with this email already exists.');

  const [firstName, ...rest] = input.name.trim().split(/\s+/);
  const lastName = rest.join(' ') || '-';

  const firebaseUser = await firebaseAuth
    .createUser({
      email,
      password: input.password,
      displayName: input.name.trim(),
      emailVerified: true,
    })
    .catch((err: { code?: string }) => {
      if (err.code === 'auth/email-already-exists') {
        throw errors.conflict('A Firebase account with this email already exists.');
      }
      throw err;
    });

  const row = await prisma.user.create({
    data: {
      firebaseUid: firebaseUser.uid,
      email,
      firstName: firstName ?? input.name.trim(),
      lastName,
      role: input.role,
      // Full admins hold everything by role, so there's nothing to store.
      ...(input.role === 'OPERATOR' && { adminPermissions: input.permissions }),
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: adminUserSelect,
  });

  return toDto(row as AdminUserRow);
}
