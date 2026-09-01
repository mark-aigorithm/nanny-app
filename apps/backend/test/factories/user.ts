/**
 * User factories.
 *
 * Each one creates the Firebase **emulator** account and the `users` row
 * together, because in the real system one never exists without the other —
 * a DB row whose `firebase_uid` points at nothing would fail `requireAuth` in a
 * way no production user ever could. The returned handle carries a signed-in ID
 * token, so a test can go straight to making authenticated requests.
 */
import type { OperatorPermissions } from '@nanny-app/shared';
import { type Prisma, Role } from '@prisma/client';

import { prisma } from '@backend/db/prisma';

import { createEmulatorUser, signInAs } from '../auth';

/** What every factory hands back: enough to act as, and assert on, this user. */
export type TestUser = {
  id: number;
  firebaseUid: string;
  email: string;
  /** Ready for `Authorization: Bearer …`. */
  token: string;
};

/**
 * Unique-email generator. The pid keeps addresses distinct across Jest workers,
 * and the counter keeps them distinct within one — `users.email` is unique, and
 * so is the emulator's account index.
 */
let sequence = 0;
function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${sequence}@test.local`;
}

/**
 * Unique E.164-shaped phone number (`users.phone` is unique). Not a real
 * Egyptian number, but paying via Paymob requires the column to be set, so
 * mothers and nannies get one by default.
 */
function uniquePhone(): string {
  return `+2010${String(process.pid % 10_000).padStart(4, '0')}${String(sequence).padStart(4, '0')}`;
}

/**
 * Fields any factory caller may override, minus the three the factory owns —
 * `firebaseUid` and `email` must stay in step with the emulator account, and
 * `role` is what distinguishes one factory from another. Everything else is
 * optional: a caller sets only what its assertion depends on.
 */
type UserOverrides = Partial<Omit<Prisma.UserCreateInput, 'firebaseUid' | 'email' | 'role'>>;

/** Creates the emulator account, the `users` row, and signs in. */
async function createUser(
  prefix: string,
  role: Role,
  overrides: UserOverrides = {},
): Promise<TestUser> {
  const email = uniqueEmail(prefix);
  const firebaseUid = await createEmulatorUser(email);

  const user = await prisma.user.create({
    data: {
      firebaseUid,
      email,
      phone: uniquePhone(),
      firstName: 'Test',
      lastName: prefix,
      role,
      // Verified by default: every real account reaches a usable state with a
      // proven address (nannies at sign-up, mothers at the booking gate), and
      // bookings are gated on it — so an unverified factory user would be a
      // surprising default that broke every booking journey. Pass
      // `isEmailVerified: false` to test the gate itself.
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      ...overrides,
    },
  });

  return { id: user.id, firebaseUid, email, token: await signInAs(email) };
}

/**
 * A mother who can book immediately: ID approved (bookings are gated on it) and
 * placed at a known coordinate so distance-ranked queries are predictable.
 * Cairo city centre, matching the seed data's region.
 */
export function makeMother(overrides: UserOverrides = {}): Promise<TestUser> {
  return createUser('mother', Role.MOTHER, {
    idVerificationStatus: 'APPROVED',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
    ...overrides,
  });
}

export type NannyOverrides = {
  user?: UserOverrides;
  profile?: Omit<Prisma.NannyProfileCreateInput, 'user'>;
};

/** A nanny plus her profile. Returns the profile id too — most queries key off it, not the user id. */
export async function makeNanny(
  overrides: NannyOverrides = {},
): Promise<TestUser & { nannyProfileId: number }> {
  const user = await createUser('nanny', Role.NANNY, {
    idVerificationStatus: 'APPROVED',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '2 Test Street, Cairo',
    ...overrides.user,
  });

  const profile = await prisma.nannyProfile.create({
    data: {
      user: { connect: { id: user.id } },
      bio: 'Factory-created nanny.',
      yearsOfExperience: 3,
      // Required, and has no schema default — omitting it fails at the DB.
      ageRanges: ['0-1', '2-5'],
      isProfileComplete: true,
      // APPROVED by default: a PENDING_REVIEW nanny is invisible to search and
      // cannot be booked, so it would be a surprising default for a factory.
      // Pass `profile: { approvalStatus: 'PENDING_REVIEW' }` to test the gate.
      approvalStatus: 'APPROVED',
      availabilityType: 'FULL_TIME',
      ...overrides.profile,
    },
  });

  return { ...user, nannyProfileId: profile.id };
}

/** Full-reach console account. */
export function makeAdmin(overrides: UserOverrides = {}): Promise<TestUser> {
  return createUser('admin', Role.ADMIN, overrides);
}

export function makeSuperuser(overrides: UserOverrides = {}): Promise<TestUser> {
  return createUser('superuser', Role.SUPERUSER, overrides);
}

/**
 * Section-scoped console account. `permissions` is the section → access-level
 * map stored in `users.admin_permissions` and evaluated by `hasSectionAccess`;
 * an operator with no grants can reach nothing, which is the deny-by-default
 * behaviour worth testing against.
 */
export function makeOperator(
  permissions: OperatorPermissions = {},
  overrides: UserOverrides = {},
): Promise<TestUser> {
  return createUser('operator', Role.OPERATOR, {
    adminPermissions: permissions as Prisma.InputJsonValue,
    ...overrides,
  });
}
