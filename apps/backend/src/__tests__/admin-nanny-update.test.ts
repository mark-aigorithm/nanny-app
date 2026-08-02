/**
 * Unit tests for `updateAdminNanny` (Task 5: PATCH /admin/nannies/:id) — the
 * admin edit path for a nanny's profile fields. Prisma is mocked; the
 * `writeNannyProfileFields` core writer (Task 2, in nanny.service.ts) is
 * mocked too since its own behavior is pinned by
 * `__tests__/nanny-profile-update.test.ts` — here we only assert that
 * `updateAdminNanny` resolves the right nanny, hands it the right
 * `{ userId, nannyProfileId, fields }`, and returns the fresh `getAdminNanny`
 * DTO afterwards.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: {
      findFirst: jest.fn(),
    },
    booking: { aggregate: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/lib/storage', () => ({
  deleteStorageObjectByUrl: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/nanny.service', () => ({
  writeNannyProfileFields: jest.fn().mockResolvedValue(undefined),
}));

import { AppError } from '@backend/lib/errors';
import { prisma } from '@backend/db/prisma';
import { writeNannyProfileFields } from '@backend/services/nanny.service';
import { updateAdminNanny } from '@backend/services/admin-nanny.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: { findFirst: jest.Mock };
  booking: { aggregate: jest.Mock };
  $transaction: jest.Mock;
};
const mockWrite = writeNannyProfileFields as jest.Mock;

const NANNY_PROFILE_ID = 19;
const USER_ID = 10;

/** Mirrors `makeRow` in admin-nanny.service.test.ts — the `nannyInclude` shape. */
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NANNY_PROFILE_ID,
    bio: 'Loves kids',
    yearsOfExperience: 4,
    nannyCertifications: [],
    nannySkills: [],
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    user: {
      id: USER_ID,
      firstName: 'Amira',
      lastName: 'Hassan',
      email: 'amira@example.com',
      phone: '+201000000000',
      dateOfBirth: null,
      avatarUrl: null,
      address: 'Cairo',
      isEmailVerified: true,
      isPhoneVerified: false,
      idVerificationStatus: 'APPROVED',
      idDocumentType: null,
      idRejectionReason: null,
      idReviewedAt: null,
      idDocumentFrontUrl: null,
      idDocumentBackUrl: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb({}));
  mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { nannyAmount: null }, _count: 0 });
});

describe('updateAdminNanny', () => {
  it('resolves the nanny by profile id, writes the given fields inside a transaction, and returns the refreshed detail DTO', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());

    const result = await updateAdminNanny(NANNY_PROFILE_ID, {
      bio: 'Updated bio',
      certificationIds: [3],
    });

    // Resolved the profile (with user) filtering out soft-deleted rows.
    expect(mockPrisma.nannyProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NANNY_PROFILE_ID, deletedAt: null, user: { deletedAt: null } },
      }),
    );

    // Wrote through the shared core writer with the resolved ids and the exact input fields.
    expect(mockWrite).toHaveBeenCalledWith(expect.anything(), {
      userId: USER_ID,
      nannyProfileId: NANNY_PROFILE_ID,
      fields: { bio: 'Updated bio', certificationIds: [3] },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Returned the getAdminNanny DTO (re-read after the transaction commits).
    expect(result.id).toBe(NANNY_PROFILE_ID);
    expect(result.userId).toBe(USER_ID);
    expect(result.bio).toBe('Loves kids'); // from the (mocked) post-write read
  });

  it('throws notFound for an unknown nanny profile id and never opens a transaction', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);

    await expect(
      updateAdminNanny(999, { bio: 'Updated bio' }),
    ).rejects.toThrow(AppError);
    await expect(
      updateAdminNanny(999, { bio: 'Updated bio' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
