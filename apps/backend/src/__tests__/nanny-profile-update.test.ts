/**
 * Unit tests for `writeNannyProfileFields`, the core nanny-profile writer
 * shared by registration and the admin-edit path. This file used to be a
 * characterization test for the nanny self-edit endpoint
 * (`updateNannyProfile`) — Task 4 of the nanny-profile-registration-
 * admin-edit plan removed that endpoint (`PUT /nanny/profile`) along with
 * the function itself, since nannies no longer edit their own profile after
 * registration. The behavior worth pinning — the user update, the profile
 * upsert (with the `isProfileComplete` recompute), and the certification
 * reconcile — all still lives in `writeNannyProfileFields`, so these tests
 * now drive that function directly with a mocked `tx`.
 */
jest.mock('@backend/db/prisma', () => ({
  // `nanny.service.ts` imports `prisma` at module scope for its other
  // exports (getNannyProfile, listNannies, etc.). `writeNannyProfileFields`
  // itself only ever touches the caller-provided `tx`, but the module-level
  // import still has to resolve to something other than the real Prisma
  // client (which would try to open a DB connection at import time).
  prisma: {},
}));

jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));

import { reconcileNannyCertifications } from '@backend/services/certification.service';
import { writeNannyProfileFields } from '@backend/services/nanny.service';

const mockReconcile = reconcileNannyCertifications as jest.Mock;

const USER_ID = 10;
const NANNY_PROFILE_ID = 1;

/**
 * Builds a fake `tx` covering everything `writeNannyProfileFields` calls:
 * `user.update` (when user-level fields are written) or
 * `user.findUniqueOrThrow` (when they aren't, to read back `address` for the
 * completeness merge), plus `nannyProfile.findUnique` (to read back the
 * not-yet-written profile fields) and `nannyProfile.upsert` (the actual
 * write).
 */
function makeTx(currentProfileForMerge: Record<string, unknown> | null, currentUserAddress: string | null) {
  return {
    user: {
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: USER_ID,
        address: currentUserAddress,
        ...data,
      })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: USER_ID, address: currentUserAddress }),
    },
    nannyProfile: {
      findUnique: jest.fn().mockResolvedValue(currentProfileForMerge),
      upsert: jest.fn().mockResolvedValue({ id: NANNY_PROFILE_ID }),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('writeNannyProfileFields', () => {
  it('updates the user row, upserts bio/location as complete, and reconciles certifications in one call', async () => {
    const tx = makeTx({ bio: 'Old bio', yearsOfExperience: 2 }, 'Cairo');

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: {
        bio: 'Loves kids, 5 years experience',
        location: 'Giza',
        certificationIds: [5],
      },
    });

    // User row: only `address` changes (location), routed through the user
    // update branch, not the profile upsert.
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { address: 'Giza' },
    });
    expect(tx.user.findUniqueOrThrow).not.toHaveBeenCalled();

    // Profile upsert carries the bio through (location/certificationIds are
    // stripped out before reaching profileFields) and recomputes
    // isProfileComplete true: bio + location (just written) + years
    // (merged in from the current row) are all present.
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID, bio: 'Loves kids, 5 years experience', isProfileComplete: true },
      update: { bio: 'Loves kids, 5 years experience', isProfileComplete: true },
      select: { id: true },
    });

    // Certifications reconciled against the plain profile id, inside the tx.
    expect(mockReconcile).toHaveBeenCalledWith(tx, NANNY_PROFILE_ID, [5]);
  });

  it('leaves the user row untouched and merges current profile/user values into the completeness recompute when no user-level fields are sent', async () => {
    // Current bio is null, so even though yearsOfExperience and location
    // (Cairo, from the user row) are present, the profile stays incomplete.
    const tx = makeTx({ bio: null, yearsOfExperience: 2 }, 'Cairo');

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { yearsOfExperience: 4 },
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.user.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: USER_ID } });

    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID, yearsOfExperience: 4, isProfileComplete: false },
      update: { yearsOfExperience: 4, isProfileComplete: false },
      select: { id: true },
    });

    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('reconciles certifications even when the array is empty, clearing all tags', async () => {
    const tx = makeTx({ bio: 'Old bio', yearsOfExperience: 2 }, 'Cairo');

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { certificationIds: [] },
    });

    // `certificationIds !== undefined` gates the reconcile, not truthiness —
    // an empty array must still reach it so all tags get cleared.
    expect(mockReconcile).toHaveBeenCalledWith(tx, NANNY_PROFILE_ID, []);
  });
});
