/**
 * Unit tests for `writeNannyProfileFields`, the core nanny-profile writer
 * shared by registration and the admin-edit path (a nanny cannot edit her
 * own profile). Driven directly with a mocked `tx`: the user update, the
 * profile upsert and the certification reconcile are what is pinned.
 */
jest.mock('@backend/db/prisma', () => ({
  // `nanny.service.ts` imports `prisma` at module scope for its other
  // exports. `writeNannyProfileFields` itself only ever touches the
  // caller-provided `tx`, but the module-level import still has to resolve
  // to something other than the real client (which would open a connection).
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

function makeTx() {
  return {
    user: { update: jest.fn().mockResolvedValue({ id: USER_ID }) },
    nannyProfile: { upsert: jest.fn().mockResolvedValue({ id: NANNY_PROFILE_ID }) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('writeNannyProfileFields', () => {
  it('routes user-level fields to the user row, profile fields to the upsert, and reconciles certifications', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: {
        bio: 'Loves kids, 5 years experience',
        location: 'Giza',
        certificationIds: [5],
      },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { address: 'Giza' },
    });
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID, bio: 'Loves kids, 5 years experience' },
      update: { bio: 'Loves kids, 5 years experience' },
      select: { id: true },
    });
    expect(mockReconcile).toHaveBeenCalledWith(tx, NANNY_PROFILE_ID, [5]);
  });

  it('writes photo, date of birth and home pin onto the user row', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: {
        avatarUrl: 'https://cdn.example/nanny.jpg',
        dateOfBirth: '1995-06-15',
        latitude: 30.0444,
        longitude: 31.2357,
      },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        avatarUrl: 'https://cdn.example/nanny.jpg',
        dateOfBirth: new Date('1995-06-15'),
        latitude: 30.0444,
        longitude: 31.2357,
      },
    });
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID },
      update: {},
      select: { id: true },
    });
  });

  it('clears the photo when avatarUrl is null', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { avatarUrl: null },
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { avatarUrl: null },
    });
  });

  it('leaves the user row untouched when only profile fields are sent', async () => {
    const tx = makeTx();

    await writeNannyProfileFields(tx as never, {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { yearsOfExperience: 4 },
    });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.nannyProfile.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      create: { userId: USER_ID, yearsOfExperience: 4 },
      update: { yearsOfExperience: 4 },
      select: { id: true },
    });
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('reconciles certifications even when the array is empty, clearing all tags', async () => {
    const tx = makeTx();

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
