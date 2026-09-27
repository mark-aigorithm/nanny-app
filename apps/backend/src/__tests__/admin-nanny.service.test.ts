jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
    },
    user: { update: jest.fn() },
    booking: { aggregate: jest.fn(), count: jest.fn() },
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

jest.mock('@backend/services/id-document.service', () => ({
  invalidateIdDocument: jest.fn().mockResolvedValue(undefined),
}));

import { AppError } from '@backend/lib/errors';
import { prisma } from '@backend/db/prisma';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import { invalidateIdDocument } from '@backend/services/id-document.service';
import {
  approveNanny,
  getAdminNanny,
  invalidateNannyId,
  listAdminNannies,
  rejectNanny,
  setNannySkills,
} from '@backend/services/admin-nanny.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    count: jest.Mock;
  };
  user: { update: jest.Mock };
  booking: { aggregate: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};
const mockDeleteStorage = deleteStorageObjectByUrl as jest.Mock;

const dec = (n: number) => ({ toNumber: () => n });

// Status and ID fields live on the user row, so they're nested under `user`.
// `userOverrides` merges into that nested object.
function makeRow(
  overrides: Record<string, unknown> = {},
  userOverrides: Record<string, unknown> = {},
) {
  return {
    id: 1,
    bio: 'Loves kids',
    yearsOfExperience: 4,
    nannyCertifications: [{ certification: { id: 1, name: 'CPR' } }],
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    user: {
      id: 10,
      firstName: 'Amira',
      lastName: 'Hassan',
      email: 'amira@example.com',
      phone: '+201000000000',
      dateOfBirth: new Date('1998-05-10T00:00:00.000Z'),
      avatarUrl: null,
      // Her default address row — where `location` now comes from.
      addresses: [{ id: 1, label: 'Home', formattedAddress: 'Cairo', governorate: null, area: null, street: null, building: null, floor: null, apartment: null, landmark: null, latitude: 30.0444, longitude: 31.2357, isDefault: true, createdAt: new Date('2026-07-01T00:00:00.000Z') }],
      isEmailVerified: true,
      isPhoneVerified: false,
      approvalStatus: 'PENDING_REVIEW',
      idDocumentType: 'NATIONAL_ID',
      rejectionReason: null,
      reviewedAt: null,
      idDocumentFrontUrl: 'https://storage.example/nanny-ids/front.jpg',
      idDocumentBackUrl: 'https://storage.example/nanny-ids/back.jpg',
      ...userOverrides,
    },
    nannySkills: [],
    ...overrides,
  };
}

type TxMock = {
  skill: {
    findMany: jest.Mock;
  };
  nannySkill: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makeTx(existingRows: Array<Record<string, unknown>>): TxMock {
  return {
    skill: {
      // Validation now runs inside the transaction (`reconcileNannySkills`);
      // individual tests override this when they need specific ids to pass.
      findMany: jest.fn().mockResolvedValue([]),
    },
    nannySkill: {
      findMany: jest.fn().mockResolvedValue(existingRows),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function stubProfileRow(skills: Array<{ id: number; name: string; isActive?: boolean }> = []) {
  return {
    id: 1,
    bio: null,
    yearsOfExperience: null,
    nannyCertifications: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    user: {
      id: 10,
      firstName: 'Amira',
      lastName: 'N',
      email: 'a@x.com',
      phone: null,
      dateOfBirth: null,
      avatarUrl: null,
      addresses: [],
      isEmailVerified: true,
      isPhoneVerified: false,
      approvalStatus: 'APPROVED',
      idDocumentType: null,
      rejectionReason: null,
      reviewedAt: null,
      idDocumentFrontUrl: null,
      idDocumentBackUrl: null,
    },
    nannySkills: skills.map((s) => ({
      skill: { feeType: null, feeValue: 0, isActive: true, ...s },
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.nannyProfile.findFirst.mockResolvedValue({ id: 1 });
  mockPrisma.booking.count.mockResolvedValue(0);
});

describe('listAdminNannies', () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('exposes both sides of the ID document in the DTO, with pagination meta', async () => {
    mockPrisma.nannyProfile.count.mockResolvedValue(3);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([makeRow()]);

    const { nannies, meta } = await listAdminNannies('PENDING_REVIEW', {
      page: 2,
      limit: 10,
      sort: 'newest',
    });

    expect(nannies[0]?.idDocumentFrontUrl).toBe('https://storage.example/nanny-ids/front.jpg');
    expect(nannies[0]?.idDocumentBackUrl).toBe('https://storage.example/nanny-ids/back.jpg');
    expect(mockPrisma.nannyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(meta).toEqual({ page: 2, limit: 10, total: 3, totalPages: 1 });
  });

  it('returns null ID urls when the nanny has not uploaded documents', async () => {
    mockPrisma.nannyProfile.count.mockResolvedValue(1);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([
      makeRow({}, { idDocumentFrontUrl: null, idDocumentBackUrl: null }),
    ]);

    const { nannies } = await listAdminNannies('ALL', { page: 1, limit: 20, sort: 'newest' });

    expect(nannies[0]?.idDocumentFrontUrl).toBeNull();
    expect(nannies[0]?.idDocumentBackUrl).toBeNull();
  });

  it('orders by the requested direction — newest first by default, oldest on request', async () => {
    mockPrisma.nannyProfile.count.mockResolvedValue(0);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([]);

    await listAdminNannies('ALL', { page: 1, limit: 20, sort: 'newest' });
    expect(mockPrisma.nannyProfile.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );

    await listAdminNannies('ALL', { page: 1, limit: 20, sort: 'oldest' });
    expect(mockPrisma.nannyProfile.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });

  it('lists her skills with their active flag, skipping skills deleted from the catalog', async () => {
    mockPrisma.nannyProfile.count.mockResolvedValue(1);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([
      makeRow({
        nannySkills: [
          { skill: { id: 4, name: 'Old', feeType: null, feeValue: 0, isActive: false } },
        ],
      }),
    ]);

    const { nannies } = await listAdminNannies('ALL', { page: 1, limit: 20, sort: 'newest' });

    expect(nannies[0]?.skills).toEqual([
      { id: 4, name: 'Old', feeType: null, feeValue: 0, isActive: false },
    ]);
    expect(mockPrisma.nannyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          nannySkills: expect.objectContaining({
            where: { deletedAt: null, skill: { deletedAt: null } },
          }),
        }),
      }),
    );
  });
});

describe('getAdminNanny (detail)', () => {
  it('exposes the userId and aggregates lifetime earnings from COMPLETED bookings', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());
    mockPrisma.booking.aggregate.mockResolvedValue({
      _sum: { nannyAmount: dec(1240) },
      _count: 7,
    });

    const dto = await getAdminNanny(12);

    expect(dto.userId).toBe(10);
    expect(dto.amountGained).toBe(1240);
    expect(dto.completedBookings).toBe(7);
    expect(mockPrisma.booking.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ nannyProfileId: 12, status: 'COMPLETED' }),
      }),
    );
  });

  it('reports zero earnings when the nanny has no completed bookings', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());
    mockPrisma.booking.aggregate.mockResolvedValue({ _sum: { nannyAmount: null }, _count: 0 });

    const dto = await getAdminNanny(12);

    expect(dto.amountGained).toBe(0);
    expect(dto.completedBookings).toBe(0);
  });

  it('throws when the nanny does not exist', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);
    await expect(getAdminNanny(999)).rejects.toThrow(AppError);
  });
});

describe('approveNanny', () => {
  it('flips the user status to APPROVED and clears the rejection reason', async () => {
    mockPrisma.nannyProfile.findFirst
      .mockResolvedValueOnce(makeRow({}, { approvalStatus: 'PENDING_REVIEW' }))
      .mockResolvedValueOnce(makeRow({}, { approvalStatus: 'APPROVED' }));
    mockPrisma.user.update.mockResolvedValue({});

    const dto = await approveNanny(1);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          approvalStatus: 'APPROVED',
          rejectionReason: null,
        }),
      }),
    );
    expect(dto.approvalStatus).toBe('APPROVED');
  });

  it('rejects approving an already approved nanny', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(
      makeRow({}, { approvalStatus: 'APPROVED' }),
    );
    await expect(approveNanny(1)).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects approving a nanny with no ID on file', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(
      makeRow(
        {},
        {
          approvalStatus: 'PENDING_REVIEW',
          idDocumentFrontUrl: null,
          idDocumentBackUrl: null,
        },
      ),
    );
    await expect(approveNanny(1)).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('rejectNanny', () => {
  it('nulls the ID urls, deletes the Storage files, and stores the reason', async () => {
    const front = 'https://storage.example/o/nanny-ids%2Fuser-1%2Ffront.jpg?alt=media';
    const back = 'https://storage.example/o/nanny-ids%2Fuser-1%2Fback.jpg?alt=media';
    mockPrisma.nannyProfile.findFirst
      .mockResolvedValueOnce(
        makeRow(
          {},
          {
            approvalStatus: 'PENDING_REVIEW',
            idDocumentFrontUrl: front,
            idDocumentBackUrl: back,
          },
        ),
      )
      .mockResolvedValueOnce(makeRow({}, { approvalStatus: 'REJECTED' }));
    mockPrisma.user.update.mockResolvedValue({});

    await rejectNanny(1, { reason: 'ID does not match name' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({
          approvalStatus: 'REJECTED',
          rejectionReason: 'ID does not match name',
          idDocumentFrontUrl: null,
          idDocumentBackUrl: null,
        }),
      }),
    );
    expect(mockDeleteStorage).toHaveBeenCalledWith(front);
    expect(mockDeleteStorage).toHaveBeenCalledWith(back);
  });

  it('rejects re-rejecting an already rejected nanny', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(
      makeRow({}, { approvalStatus: 'REJECTED' }),
    );
    await expect(rejectNanny(1, {})).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('invalidateNannyId', () => {
  it('invalidates the ID of the nanny behind the profile id', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());

    const result = await invalidateNannyId(1, { reason: 'Blurry' });

    expect(invalidateIdDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, idDocumentFrontUrl: 'https://storage.example/nanny-ids/front.jpg' }),
      { reason: 'Blurry' },
      'NANNY',
    );
    expect(result.id).toBe(1);
  });

  it('counts her active bookings by profile id, excluding soft-deleted rows', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());

    await invalidateNannyId(1, {});

    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        nannyProfileId: 1,
        status: {
          in: ['PENDING', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'],
        },
      },
    });
  });

  it('refuses with 409 when she has active bookings, without touching her ID', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeRow());
    mockPrisma.booking.count.mockResolvedValue(2);

    await expect(invalidateNannyId(1, {})).rejects.toMatchObject({
      statusCode: 409,
      message: "She has active bookings. Request a new ID once they're finished or reassigned.",
    });
    expect(invalidateIdDocument).not.toHaveBeenCalled();
  });

  it('404s for an unknown nanny', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);
    await expect(invalidateNannyId(99, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('setNannySkills', () => {
  it('throws notFound (404) when the nanny does not exist', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);
    await expect(setNannySkills(19, { skillIds: [1] })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws badRequest (400) when a skill id is unknown or inactive', async () => {
    const tx = makeTx([]);
    tx.skill.findMany.mockResolvedValue([{ id: 1 }]); // only 1 of 2 valid
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));

    await expect(setNannySkills(19, { skillIds: [1, 2] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('creates new links, reactivates soft-deleted, and removes unwanted', async () => {
    // Desired: s1 (already active), s2 (soft-deleted → reactivate), s3 (new).
    // Existing s4 is active but not desired → soft-delete.
    const tx = makeTx([
      { id: 11, skillId: 1, deletedAt: null },
      { id: 12, skillId: 2, deletedAt: new Date() },
      { id: 14, skillId: 4, deletedAt: null },
    ]);
    tx.skill.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));
    mockPrisma.nannyProfile.findUniqueOrThrow.mockResolvedValue(
      stubProfileRow([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ]),
    );

    const result = await setNannySkills(19, { skillIds: [1, 2, 3] });

    // s4 soft-deleted
    expect(tx.nannySkill.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [14] } },
      data: { deletedAt: expect.any(Date) },
    });
    // s3 created
    expect(tx.nannySkill.create).toHaveBeenCalledWith({
      data: { nannyProfileId: 19, skillId: 3 },
    });
    // s2 reactivated
    expect(tx.nannySkill.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { deletedAt: null },
    });
    // s1 untouched (already active) — only one create, one update
    expect(tx.nannySkill.create).toHaveBeenCalledTimes(1);
    expect(tx.nannySkill.update).toHaveBeenCalledTimes(1);

    expect(result.skills).toEqual([
      { id: 1, name: 'A', feeType: null, feeValue: 0, isActive: true },
      { id: 2, name: 'B', feeType: null, feeValue: 0, isActive: true },
      { id: 3, name: 'C', feeType: null, feeValue: 0, isActive: true },
    ]);
  });

  it('lets a nanny keep a skill she already holds after it was deactivated', async () => {
    // She holds s4, which has since been deactivated; the admin adds s5.
    const tx = makeTx([{ id: 17, skillId: 4, deletedAt: null }]);
    tx.skill.findMany.mockResolvedValue([{ id: 4 }, { id: 5 }]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));
    mockPrisma.nannyProfile.findUniqueOrThrow.mockResolvedValue(
      stubProfileRow([
        { id: 4, name: 'Old', isActive: false },
        { id: 5, name: 'New' },
      ]),
    );

    const result = await setNannySkills(19, { skillIds: [4, 5] });

    // Only skills she already holds may be inactive; anything new must be active.
    expect(tx.skill.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [4, 5] },
        deletedAt: null,
        OR: [{ isActive: true }, { id: { in: [4] } }],
      },
      select: { id: true },
    });
    expect(tx.nannySkill.create).toHaveBeenCalledWith({
      data: { nannyProfileId: 19, skillId: 5 },
    });
    expect(result.skills.map((s) => [s.id, s.isActive])).toEqual([
      [4, false],
      [5, true],
    ]);
  });

  it('does not grandfather a skill whose link was already removed', async () => {
    // A soft-deleted link is not "held" — re-adding it counts as a new assignment.
    const tx = makeTx([{ id: 17, skillId: 4, deletedAt: new Date() }]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));

    await expect(setNannySkills(19, { skillIds: [4] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(tx.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ isActive: true }, { id: { in: [] } }] }),
      }),
    );
  });

  it('clearing all skills soft-deletes every active link and creates none', async () => {
    const tx = makeTx([{ id: 11, skillId: 1, deletedAt: null }]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));
    mockPrisma.nannyProfile.findUniqueOrThrow.mockResolvedValue(stubProfileRow([]));

    const result = await setNannySkills(19, { skillIds: [] });

    expect(tx.skill.findMany).not.toHaveBeenCalled(); // no ids to validate
    expect(tx.nannySkill.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [11] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.nannySkill.create).not.toHaveBeenCalled();
    expect(result.skills).toEqual([]);
  });
});
