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
  /** Her default address row, when the factory placed her somewhere. */
  addressId?: number;
};

/**
 * Unique-email generator. The pid keeps addresses distinct across Jest workers,
 * and the counter keeps them distinct within one — `users.email` is unique, and
 * so is the emulator's account index.
 */
let sequence = 0;
function uniqueEmail(prefix: string, seq: number): string {
  return `${prefix}-${process.pid}-${seq}@test.local`;
}

/**
 * Unique E.164-shaped phone number (`users.phone` is unique). Not a real
 * Egyptian number, but paying via Paymob requires the column to be set, so
 * mothers and nannies get one by default.
 */
function uniquePhone(seq: number): string {
  return `+2010${String(process.pid % 10_000).padStart(4, '0')}${String(seq).padStart(4, '0')}`;
}

/**
 * Fields any factory caller may override, minus the three the factory owns —
 * `firebaseUid` and `email` must stay in step with the emulator account, and
 * `role` is what distinguishes one factory from another. Everything else is
 * optional: a caller sets only what its assertion depends on.
 *
 * `address`, `latitude` and `longitude` are kept as override names for the
 * many tests that place a user somewhere, but they no longer touch the
 * deprecated users columns: the factory writes them to the user's default
 * `addresses` row, which is where every reader now looks.
 */
type UserOverrides = Partial<Omit<Prisma.UserCreateInput, 'firebaseUid' | 'email' | 'role'>>;

/** Creates the emulator account, the `users` row, and signs in. */
async function createUser(
  prefix: string,
  role: Role,
  overrides: UserOverrides = {},
): Promise<TestUser> {
  // Taken once, before the first await: two factories running concurrently
  // (`Promise.all([makeNanny(), makeNanny()])`) must not read the counter
  // after the other has moved it, or they collide on the unique phone column.
  sequence += 1;
  const seq = sequence;
  const email = uniqueEmail(prefix, seq);
  const firebaseUid = await createEmulatorUser(email);

  const { address, latitude, longitude, ...userOverrides } = overrides;

  const user = await prisma.user.create({
    data: {
      firebaseUid,
      email,
      phone: uniquePhone(seq),
      firstName: 'Test',
      lastName: prefix,
      role,
      // Verified by default: registration proves the address for both roles, so
      // every account created by the app has one — and bookings are gated on it,
      // so an unverified factory user would be a surprising default that broke
      // every booking journey. Pass `isEmailVerified: false` to stand in for an
      // account created before that rule.
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      ...userOverrides,
    },
  });

  let addressId: number | undefined;
  if (latitude != null && longitude != null) {
    const row = await prisma.address.create({
      data: {
        userId: user.id,
        label: 'Home',
        formattedAddress: typeof address === 'string' ? address : '',
        latitude: latitude as Prisma.Decimal | number | string,
        longitude: longitude as Prisma.Decimal | number | string,
        isDefault: true,
      },
    });
    addressId = row.id;
  }

  return {
    id: user.id,
    firebaseUid,
    email,
    token: await signInAs(email),
    ...(addressId === undefined ? {} : { addressId }),
  };
}

/**
 * A mother who can book immediately: ID approved (bookings are gated on it) and
 * placed at a known coordinate so distance-ranked queries are predictable.
 * Cairo city centre, matching the seed data's region.
 */
export function makeMother(overrides: UserOverrides = {}): Promise<TestUser> {
  return createUser('mother', Role.MOTHER, {
    approvalStatus: 'APPROVED',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
    ...overrides,
  });
}

export type NannyOverrides = {
  user?: UserOverrides;
  profile?: Omit<Prisma.NannyProfileCreateInput, 'user'>;
  /** Skills she holds (`nanny_skills` rows). Broadcast matching filters on these. */
  skillIds?: number[];
};

/** A nanny plus her profile. Returns the profile id too — most queries key off it, not the user id. */
export async function makeNanny(
  overrides: NannyOverrides = {},
): Promise<TestUser & { nannyProfileId: number }> {
  const user = await createUser('nanny', Role.NANNY, {
    // APPROVED by default: a PENDING_REVIEW nanny is invisible to search and
    // cannot be booked, so it would be a surprising default for a factory.
    // Pass `user: { approvalStatus: 'PENDING_REVIEW' }` to test the gate.
    approvalStatus: 'APPROVED',
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
      availabilityType: 'FULL_TIME',
      ...overrides.profile,
    },
  });

  if (overrides.skillIds?.length) {
    await prisma.nannySkill.createMany({
      data: overrides.skillIds.map((skillId) => ({ nannyProfileId: profile.id, skillId })),
    });
  }

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
