jest.mock('@backend/db/prisma', () => ({
  prisma: {
    durationMultiplierRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createDurationRule,
  deleteDurationRule,
  listActiveDurationRules,
  listDurationRules,
  updateDurationRule,
} from '@backend/services/duration-rule.service';

const mockPrisma = prisma as unknown as {
  durationMultiplierRule: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 24,
    minHours: 3,
    multiplier: 0.9,
    label: 'Half day',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('listDurationRules', () => {
  it('returns all non-deleted rules as DTOs, lowest tier first', async () => {
    mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([makeRule()]);
    const rows = await listDurationRules();
    expect(mockPrisma.durationMultiplierRule.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { minHours: 'asc' },
    });
    expect(rows).toEqual([
      {
        id: 24,
        minHours: 3,
        multiplier: 0.9,
        label: 'Half day',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('listActiveDurationRules', () => {
  it('queries only active rules and returns the public shape', async () => {
    mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([
      { minHours: 3, multiplier: 0.9, label: 'Half day' },
    ]);
    const rows = await listActiveDurationRules();
    expect(mockPrisma.durationMultiplierRule.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { minHours: 'asc' },
      select: { minHours: true, multiplier: true, label: true },
    });
    expect(rows).toEqual([{ minHours: 3, multiplier: 0.9, label: 'Half day' }]);
  });
});

describe('createDurationRule', () => {
  it('creates a tier when the minHours is free', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(null);
    mockPrisma.durationMultiplierRule.create.mockResolvedValue(makeRule());
    const created = await createDurationRule({
      minHours: 3,
      multiplier: 0.9,
      label: 'Half day',
      isActive: true,
    });
    expect(created.id).toBe(24);
  });

  it('throws conflict (409) when a tier for the same minHours exists', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(makeRule());
    await expect(
      createDurationRule({ minHours: 3, multiplier: 0.9, isActive: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.durationMultiplierRule.create).not.toHaveBeenCalled();
  });
});

describe('updateDurationRule', () => {
  it('throws notFound (404) when the rule is missing', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(null);
    await expect(updateDurationRule(999, { multiplier: 0.8 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('updates provided fields', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(makeRule());
    mockPrisma.durationMultiplierRule.update.mockResolvedValue(makeRule({ multiplier: 0.8 }));
    const updated = await updateDurationRule(24, { multiplier: 0.8 });
    expect(updated.multiplier).toBe(0.8);
  });
});

describe('deleteDurationRule', () => {
  it('soft-deletes an existing rule', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(makeRule());
    mockPrisma.durationMultiplierRule.update.mockResolvedValue(makeRule({ deletedAt: new Date() }));
    const res = await deleteDurationRule(24);
    expect(res).toEqual({ id: 24 });
    expect(mockPrisma.durationMultiplierRule.update).toHaveBeenCalledWith({
      where: { id: 24 },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
