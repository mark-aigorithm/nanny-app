import { IdVerificationStatus, type Prisma } from '@prisma/client';

import type {
  AdminListQuery,
  AdminMother,
  AdminMotherStatusFilter,
  AdminUser,
  CreateAdminInput,
  PaginationMeta,
  RejectNannyInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
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

type AdminUserRow = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'SUPERUSER';
  createdAt: Date;
};

function toDto(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    // "-" is the placeholder last name used when an admin is created
    // from a single-word name — hide it in the display name.
    name: `${row.firstName} ${row.lastName === '-' ? '' : row.lastName}`.trim(),
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Profile of the calling admin — the UI uses `role` to gate superuser tabs. */
export async function getAdminProfile(firebaseUid: string): Promise<AdminUser> {
  const row = await prisma.user.findFirst({
    where: { firebaseUid, deletedAt: null, role: { in: ['ADMIN', 'SUPERUSER'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });
  if (!row) throw errors.forbidden('Admin access required');
  return toDto(row as AdminUserRow);
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null, role: { in: ['ADMIN', 'SUPERUSER'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => toDto(row as AdminUserRow));
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
export async function getAdminMother(id: number): Promise<AdminMother> {
  return toMotherDto(await findReviewableMother(id));
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

/** Superuser creates an admin: Firebase Auth account + ADMIN user row. */
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
      role: 'ADMIN',
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return toDto(row as AdminUserRow);
}
