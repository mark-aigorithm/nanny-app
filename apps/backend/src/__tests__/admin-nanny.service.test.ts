import { NannyApprovalStatus } from '@prisma/client';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
    },
    booking: { aggregate: jest.fn() },
    skill: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { AppError } from '@backend/lib/errors';
import { prisma } from '@backend/db/prisma';
import {
  getAdminNanny,
  listAdminNannies,
  setNannySkills,
} from '@backend/services/admin-nanny.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    count: jest.Mock;
  };
  booking: { aggregate: jest.Mock };
  skill: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const dec = (n: number) => ({ toNumber: () => n });

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    bio: 'Loves kids',
    yearsOfExperience: 4,
    certifications: ['CPR'],
    approvalStatus: NannyApprovalStatus.PENDING_REVIEW,
    rejectionReason: null,
    reviewedAt: null,
    idDocumentFrontUrl: 'https://storage.example/nanny-ids/front.jpg',
    idDocumentBackUrl: 'https://storage.example/nanny-ids/back.jpg',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    user: {
      id: 10,
      firstName: 'Amira',
      lastName: 'Hassan',
      email: 'amira@example.com',
      phone: '+201000000000',
      dateOfBirth: new Date('1998-05-10T00:00:00.000Z'),
      avatarUrl: null,
      address: 'Cairo',
      isEmailVerified: true,
      isPhoneVerified: false,
    },
    nannySkills: [],
    ...overrides,
  };
}

type TxMock = {
  nannySkill: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makeTx(existingRows: Array<Record<string, unknown>>): TxMock {
  return {
    nannySkill: {
      findMany: jest.fn().mockResolvedValue(existingRows),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

function stubProfileRow(skills: Array<{ id: number; name: string }> = []) {
  return {
    id: 1,
    bio: null,
    yearsOfExperience: null,
    certifications: [],
    approvalStatus: 'APPROVED',
    rejectionReason: null,
    reviewedAt: null,
    idDocumentFrontUrl: null,
    idDocumentBackUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    user: {
      id: 10,
      firstName: 'Amira',
      lastName: 'N',
      email: 'a@x.com',
      phone: null,
      dateOfBirth: null,
      avatarUrl: null,
      address: null,
      isEmailVerified: true,
      isPhoneVerified: false,
    },
    nannySkills: skills.map((s) => ({ skill: { feeType: null, feeValue: 0, ...s } })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.nannyProfile.findFirst.mockResolvedValue({ id: 1 });
});

describe('listAdminNannies', () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('exposes both sides of the ID document in the DTO, with pagination meta', async () => {
    mockPrisma.nannyProfile.count.mockResolvedValue(3);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([makeRow()]);

    const { nannies, meta } = await listAdminNannies('PENDING_REVIEW', { page: 2, limit: 10 });

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
      makeRow({ idDocumentFrontUrl: null, idDocumentBackUrl: null }),
    ]);

    const { nannies } = await listAdminNannies('ALL', { page: 1, limit: 20 });

    expect(nannies[0]?.idDocumentFrontUrl).toBeNull();
    expect(nannies[0]?.idDocumentBackUrl).toBeNull();
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

describe('setNannySkills', () => {
  it('throws notFound (404) when the nanny does not exist', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);
    await expect(setNannySkills(19, { skillIds: [1] })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws badRequest (400) when a skill id is unknown or inactive', async () => {
    mockPrisma.skill.findMany.mockResolvedValue([{ id: 1 }]); // only 1 of 2 valid
    await expect(setNannySkills(19, { skillIds: [1, 2] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('creates new links, reactivates soft-deleted, and removes unwanted', async () => {
    // Desired: s1 (already active), s2 (soft-deleted → reactivate), s3 (new).
    // Existing s4 is active but not desired → soft-delete.
    mockPrisma.skill.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const tx = makeTx([
      { id: 11, skillId: 1, deletedAt: null },
      { id: 12, skillId: 2, deletedAt: new Date() },
      { id: 14, skillId: 4, deletedAt: null },
    ]);
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
      { id: 1, name: 'A', feeType: null, feeValue: 0 },
      { id: 2, name: 'B', feeType: null, feeValue: 0 },
      { id: 3, name: 'C', feeType: null, feeValue: 0 },
    ]);
  });

  it('clearing all skills soft-deletes every active link and creates none', async () => {
    const tx = makeTx([{ id: 11, skillId: 1, deletedAt: null }]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));
    mockPrisma.nannyProfile.findUniqueOrThrow.mockResolvedValue(stubProfileRow([]));

    const result = await setNannySkills(19, { skillIds: [] });

    expect(mockPrisma.skill.findMany).not.toHaveBeenCalled(); // no ids to validate
    expect(tx.nannySkill.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [11] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.nannySkill.create).not.toHaveBeenCalled();
    expect(result.skills).toEqual([]);
  });
});
