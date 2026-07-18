import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    nannyProfile: { findMany: jest.fn() },
    booking: { findFirst: jest.fn(), create: jest.fn() },
    skill: { findMany: jest.fn() },
    durationMultiplierRule: { findMany: jest.fn() },
  },
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(6),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
  getPlatformConfig: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import { createBooking } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findMany: jest.Mock };
  booking: { findFirst: jest.Mock; create: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};
const mockConfig = getPlatformConfig as jest.Mock;

const DECODED = { uid: 'fb-mother' } as never;
const NOW_UTC = new Date('2026-07-20T07:00:00.000Z'); // 10:00 Cairo
const VALID_BODY = {
  startTime: '2026-07-20T14:00:00',
  endTime: '2026-07-20T18:00:00',
  skillIds: [] as number[],
};

const BASE_CONFIG = {
  serviceFeePercent: 6,
  standardHourlyRate: 100,
  nannyPercent: 80,
  platformPercent: 20,
  maxBookingHours: 12,
  minBookingHours: 2,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
  bookingWindowStartHour: 8,
  bookingWindowEndHour: 22,
};

function motherWith(status: string | null) {
  return { id: 'mother-1', role: Role.MOTHER, deletedAt: null, idVerificationStatus: status };
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW_UTC);
});
afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockConfig.mockResolvedValue(BASE_CONFIG);
  mockPrisma.booking.create.mockResolvedValue({
    id: 'booking-1',
    motherId: 'mother-1',
    mother: { firstName: 'Jane', lastName: 'Mom', avatarUrl: null },
    nannyProfileId: null,
    nannyProfile: null,
    status: 'PENDING',
    nannyDecision: 'PENDING',
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: new Date('2026-07-20T00:00:00.000Z'),
    startTime: new Date('2026-07-20T11:00:00.000Z'),
    endTime: new Date('2026-07-20T15:00:00.000Z'),
    durationHours: 4,
    baseRate: 100,
    effectiveHourlyRate: 100,
    selectedSkillFees: null,
    subtotal: 400,
    durationMultiplier: 1,
    discountAmount: 0,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount: 400,
    nannyAmount: 320,
    platformAmount: 80,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    startPinHash: null,
    startPinExpiresAt: null,
    payment: null,
    review: null,
    createdAt: NOW_UTC,
  });
});

describe('createBooking — mother ID gate', () => {
  it('blocks a mother who has never uploaded an ID (PENDING_ID)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherWith('PENDING_ID'));
    await expect(createBooking(DECODED, VALID_BODY)).rejects.toThrow(
      'Please upload your ID before booking.',
    );
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('blocks a mother whose ID was rejected (REJECTED)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherWith('REJECTED'));
    await expect(createBooking(DECODED, VALID_BODY)).rejects.toThrow(
      'Please upload your ID before booking.',
    );
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('allows a mother with an ID under review (PENDING_REVIEW) — upload-then-book', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherWith('PENDING_REVIEW'));
    const res = await createBooking(DECODED, VALID_BODY);
    expect(res.status).toBe('PENDING');
    expect(mockPrisma.booking.create).toHaveBeenCalled();
  });

  it('allows an APPROVED mother', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(motherWith('APPROVED'));
    const res = await createBooking(DECODED, VALID_BODY);
    expect(res.status).toBe('PENDING');
  });
});
