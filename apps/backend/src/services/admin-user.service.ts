import type { Prisma } from '@prisma/client';

import type {
  AdminListQuery,
  AdminMother,
  AdminMotherDetail,
  AdminUser,
  CreateAdminInput,
  PaginationMeta,
  UpdateAdminMotherInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';

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
    bookingCount: row._count.bookingsAsMother,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Detail DTO: the list fields plus the raw first/last name split for the edit form. */
function toMotherDetailDto(row: AdminMotherRow): AdminMotherDetail {
  return {
    ...toMotherDto(row),
    firstName: row.firstName,
    lastName: row.lastName,
  };
}

type AdminUserRow = {
  id: string;
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

/** Read-only, paginated directory of mother (parent) accounts for the admin Users page. */
export async function listAdminMothers(
  { page, limit }: AdminListQuery,
): Promise<{ mothers: AdminMother[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = { role: 'MOTHER', deletedAt: null };

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
export async function getAdminMother(id: string): Promise<AdminMotherDetail> {
  const row = await prisma.user.findFirst({
    where: { id, role: 'MOTHER', deletedAt: null },
    select: motherSelect,
  });
  if (!row) throw errors.notFound('Mother not found');
  return toMotherDetailDto(row);
}

/**
 * Partial update of a mother account from the admin console. Only name and the
 * `isActive` flag are editable — email/phone (Firebase Auth identity),
 * verification flags, and address (tied to matching coordinates) are not touched.
 */
export async function updateAdminMother(
  id: string,
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
