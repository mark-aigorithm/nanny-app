/**
 * Characterization test for `updateNannyProfile`, written ahead of the
 * `writeNannyProfileFields` extraction (Task 2 of the nanny-profile-
 * registration-admin-edit plan). It pins today's behavior — bio, location,
 * and certifications all get written in one call — and must stay green
 * across the refactor that moves the transaction body into the reusable
 * `writeNannyProfileFields` core writer.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));

import { Role } from '@nanny-app/shared';

import type { DecodedIdToken } from '@backend/lib/firebase';
import { prisma } from '@backend/db/prisma';
import { reconcileNannyCertifications } from '@backend/services/certification.service';
import { updateNannyProfile } from '@backend/services/nanny.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const mockReconcile = reconcileNannyCertifications as jest.Mock;

const DECODED = { uid: 'fb-nanny-1' } as DecodedIdToken;

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    role: Role.NANNY,
    deletedAt: null,
    firstName: 'Amira',
    lastName: 'Hassan',
    avatarUrl: null,
    address: 'Cairo',
    latitude: null,
    longitude: null,
    nannyProfile: {
      id: 1,
      bio: 'Old bio',
      yearsOfExperience: 2,
      ageRanges: [],
      schedule: null,
      availabilityType: 'OCCASIONAL',
      isProfileComplete: false,
      rating: 0,
      reviewCount: 0,
      nannySkills: [],
      nannyCertifications: [],
    },
    ...overrides,
  };
}

/**
 * Builds a fake `tx`. Covers both the pre-refactor shape (only `user.update`
 * + `nannyProfile.upsert`/`findUniqueOrThrow` are ever called) and the
 * post-refactor shape (the core writer also reads back via
 * `user.findUniqueOrThrow` and `nannyProfile.findUnique` to merge
 * not-yet-written fields into the `isProfileComplete` recompute).
 * `user.update`/`user.findUniqueOrThrow` share mutable state so whichever
 * one the implementation calls last still reflects prior writes.
 */
function makeTx(
  initialUser: ReturnType<typeof makeUser>,
  currentProfileForMerge: Record<string, unknown>,
  profileAfterReconcile: Record<string, unknown>,
) {
  let currentUser: Record<string, unknown> = { ...initialUser };
  return {
    user: {
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        currentUser = { ...currentUser, ...data };
        return currentUser;
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(() => currentUser),
    },
    nannyProfile: {
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
      findUnique: jest.fn().mockResolvedValue(currentProfileForMerge),
      findUniqueOrThrow: jest.fn().mockResolvedValue(profileAfterReconcile),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateNannyProfile', () => {
  it('updates bio, location, and reconciles certifications in one call', async () => {
    const user = makeUser();
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const tx = makeTx(
      user,
      { bio: 'Old bio', yearsOfExperience: 2 },
      {
        id: 1,
        bio: 'Loves kids, 5 years experience',
        yearsOfExperience: 2,
        ageRanges: [],
        schedule: null,
        availabilityType: 'OCCASIONAL',
        isProfileComplete: true,
        rating: 0,
        reviewCount: 0,
        nannySkills: [],
        nannyCertifications: [{ certification: { id: 5, name: 'CPR' } }],
      },
    );
    mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    const result = await updateNannyProfile(DECODED, {
      bio: 'Loves kids, 5 years experience',
      location: 'Giza',
      certificationIds: [5],
    });

    // User row: only `address` changes (location), routed through the user
    // update branch, not the profile upsert.
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { address: 'Giza' },
    });

    // Profile upsert carries the bio through (location/certificationIds are
    // stripped out before reaching profileFields).
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 10 },
        update: expect.objectContaining({ bio: 'Loves kids, 5 years experience' }),
      }),
    );

    // Certifications reconciled against the plain profile id, inside the tx.
    expect(mockReconcile).toHaveBeenCalledWith(tx, 1, [5]);

    // Response reflects all three writes.
    expect(result.bio).toBe('Loves kids, 5 years experience');
    expect(result.location).toBe('Giza');
    expect(result.certifications).toEqual([{ id: 5, name: 'CPR' }]);
    expect(result.isProfileComplete).toBe(true);
  });

  it('leaves the user row untouched when no user-level fields are sent', async () => {
    const user = makeUser();
    mockPrisma.user.findUnique.mockResolvedValue(user);

    const tx = makeTx(
      user,
      { bio: 'Old bio', yearsOfExperience: 2 },
      {
        id: 1,
        bio: 'Old bio',
        yearsOfExperience: 4,
        ageRanges: [],
        schedule: null,
        availabilityType: 'OCCASIONAL',
        isProfileComplete: false,
        rating: 0,
        reviewCount: 0,
        nannySkills: [],
        nannyCertifications: [],
      },
    );
    mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

    await updateNannyProfile(DECODED, { yearsOfExperience: 4 });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ yearsOfExperience: 4 }),
      }),
    );
    expect(mockReconcile).not.toHaveBeenCalled();
  });
});
