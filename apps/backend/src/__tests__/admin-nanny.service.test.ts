import { NannyApprovalStatus } from '@prisma/client';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: { findMany: jest.fn() },
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { listAdminNannies } from '@backend/services/admin-nanny.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: { findMany: jest.Mock };
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
    ...overrides,
  };
}

describe('listAdminNannies', () => {
  beforeEach(() => jest.clearAllMocks());

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
