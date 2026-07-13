import type { AdminMother, AdminUser, CreateAdminInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';

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

/** Read-only directory of mother (parent) accounts for the admin Users page. */
export async function listAdminMothers(): Promise<AdminMother[]> {
  const rows = await prisma.user.findMany({
    where: { role: 'MOTHER', deletedAt: null },
    select: {
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
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) => ({
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
  }));
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
