import { NannyApprovalStatus } from '@prisma/client';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    skill: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { listAdminNannies, setNannySkills } from '@backend/services/admin-nanny.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  skill: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const dec = (n: number) => ({ toNumber: () => n });

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'nanny-1',
    bio: 'Loves kids',
    yearsOfExperience: 4,
    hourlyRate: dec(80),
    certifications: ['CPR'],
    approvalStatus: NannyApprovalStatus.PENDING_REVIEW,
    rejectionReason: null,
    reviewedAt: null,
    idDocumentFrontUrl: 'https://storage.example/nanny-ids/front.jpg',
    idDocumentBackUrl: 'https://storage.example/nanny-ids/back.jpg',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    user: {
      id: 'user-1',
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

function stubProfileRow(skills: Array<{ id: string; name: string }> = []) {
  return {
    id: 'np-1',
    bio: null,
    yearsOfExperience: null,
    hourlyRate: null,
    certifications: [],
    approvalStatus: 'APPROVED',
    rejectionReason: null,
    reviewedAt: null,
    idDocumentFrontUrl: null,
    idDocumentBackUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    user: {
      id: 'user-1',
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
  mockPrisma.nannyProfile.findFirst.mockResolvedValue({ id: 'np-1' });
});

describe('listAdminNannies', () => {
  it('exposes both sides of the ID document in the DTO', async () => {
    mockPrisma.nannyProfile.findMany.mockResolvedValue([makeRow()]);

    const [dto] = await listAdminNannies('PENDING_REVIEW');

    expect(dto.idDocumentFrontUrl).toBe('https://storage.example/nanny-ids/front.jpg');
    expect(dto.idDocumentBackUrl).toBe('https://storage.example/nanny-ids/back.jpg');
  });

  it('returns null ID urls when the nanny has not uploaded documents', async () => {
    mockPrisma.nannyProfile.findMany.mockResolvedValue([
      makeRow({ idDocumentFrontUrl: null, idDocumentBackUrl: null }),
    ]);

    const [dto] = await listAdminNannies('ALL');

    expect(dto.idDocumentFrontUrl).toBeNull();
    expect(dto.idDocumentBackUrl).toBeNull();
  });
});

describe('setNannySkills', () => {
  it('throws notFound (404) when the nanny does not exist', async () => {
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(null);
    await expect(setNannySkills('np-1', { skillIds: ['s1'] })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws badRequest (400) when a skill id is unknown or inactive', async () => {
    mockPrisma.skill.findMany.mockResolvedValue([{ id: 's1' }]); // only 1 of 2 valid
    await expect(setNannySkills('np-1', { skillIds: ['s1', 's2'] })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('creates new links, reactivates soft-deleted, and removes unwanted', async () => {
    // Desired: s1 (already active), s2 (soft-deleted → reactivate), s3 (new).
    // Existing s4 is active but not desired → soft-delete.
    mockPrisma.skill.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    const tx = makeTx([
      { id: 'ns1', skillId: 's1', deletedAt: null },
      { id: 'ns2', skillId: 's2', deletedAt: new Date() },
      { id: 'ns4', skillId: 's4', deletedAt: null },
    ]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));
    mockPrisma.nannyProfile.findUniqueOrThrow.mockResolvedValue(
      stubProfileRow([
        { id: 's1', name: 'A' },
        { id: 's2', name: 'B' },
        { id: 's3', name: 'C' },
      ]),
    );

    const result = await setNannySkills('np-1', { skillIds: ['s1', 's2', 's3'] });

    // s4 soft-deleted
    expect(tx.nannySkill.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ns4'] } },
      data: { deletedAt: expect.any(Date) },
    });
    // s3 created
    expect(tx.nannySkill.create).toHaveBeenCalledWith({
      data: { nannyProfileId: 'np-1', skillId: 's3' },
    });
    // s2 reactivated
    expect(tx.nannySkill.update).toHaveBeenCalledWith({
      where: { id: 'ns2' },
      data: { deletedAt: null },
    });
    // s1 untouched (already active) — only one create, one update
    expect(tx.nannySkill.create).toHaveBeenCalledTimes(1);
    expect(tx.nannySkill.update).toHaveBeenCalledTimes(1);

    expect(result.skills).toEqual([
      { id: 's1', name: 'A', feeType: null, feeValue: 0 },
      { id: 's2', name: 'B', feeType: null, feeValue: 0 },
      { id: 's3', name: 'C', feeType: null, feeValue: 0 },
    ]);
  });

  it('clearing all skills soft-deletes every active link and creates none', async () => {
    const tx = makeTx([{ id: 'ns1', skillId: 's1', deletedAt: null }]);
    mockPrisma.$transaction.mockImplementation((cb: (tx: TxMock) => unknown) => cb(tx));
    mockPrisma.nannyProfile.findUniqueOrThrow.mockResolvedValue(stubProfileRow([]));

    const result = await setNannySkills('np-1', { skillIds: [] });

    expect(mockPrisma.skill.findMany).not.toHaveBeenCalled(); // no ids to validate
    expect(tx.nannySkill.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ns1'] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.nannySkill.create).not.toHaveBeenCalled();
    expect(result.skills).toEqual([]);
  });
});
