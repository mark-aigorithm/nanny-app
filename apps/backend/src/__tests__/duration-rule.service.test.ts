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

describe('duration rule tiers — guards and field handling', () => {
  it('stores a missing label as null on create', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(null);
    mockPrisma.durationMultiplierRule.create.mockResolvedValue(makeRule({ label: null }));

    const created = await createDurationRule({ minHours: 3, multiplier: 0.9, isActive: false });

    expect(mockPrisma.durationMultiplierRule.findFirst).toHaveBeenCalledWith({
      where: { minHours: 3, deletedAt: null },
    });
    expect(mockPrisma.durationMultiplierRule.create).toHaveBeenCalledWith({
      data: { minHours: 3, multiplier: 0.9, label: null, isActive: false },
    });
    expect(created.label).toBeNull();
  });

  it('names the clashing tier in the conflict message', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(makeRule());
    await expect(
      createDurationRule({ minHours: 3, multiplier: 0.9, isActive: true }),
    ).rejects.toMatchObject({ message: 'A tier for 3h already exists' });
  });

  it('converts a Decimal multiplier to a plain number', async () => {
    mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([
      makeRule({ multiplier: { toString: () => '0.85', valueOf: () => 0.85 } }),
    ]);
    const [rule] = await listDurationRules();
    expect(rule?.multiplier).toBe(0.85);
  });

  it('refuses to move a tier onto another live tier’s minHours', async () => {
    mockPrisma.durationMultiplierRule.findFirst
      .mockResolvedValueOnce(makeRule({ id: 24, minHours: 3 }))
      .mockResolvedValueOnce(makeRule({ id: 25, minHours: 6 }));

    await expect(updateDurationRule(24, { minHours: 6 })).rejects.toMatchObject({
      statusCode: 409,
      message: 'A tier for 6h already exists',
    });
    expect(mockPrisma.durationMultiplierRule.findFirst).toHaveBeenLastCalledWith({
      where: { minHours: 6, deletedAt: null, id: { not: 24 } },
    });
    expect(mockPrisma.durationMultiplierRule.update).not.toHaveBeenCalled();
  });

  it('moves a tier to a free minHours', async () => {
    mockPrisma.durationMultiplierRule.findFirst
      .mockResolvedValueOnce(makeRule({ minHours: 3 }))
      .mockResolvedValueOnce(null);
    mockPrisma.durationMultiplierRule.update.mockResolvedValue(makeRule({ minHours: 6 }));

    await expect(updateDurationRule(24, { minHours: 6 })).resolves.toMatchObject({ minHours: 6 });
    expect(mockPrisma.durationMultiplierRule.update).toHaveBeenCalledWith({
      where: { id: 24 },
      data: { minHours: 6 },
    });
  });

  it('skips the clash check when minHours is resent unchanged', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValueOnce(makeRule({ minHours: 3 }));
    mockPrisma.durationMultiplierRule.update.mockResolvedValue(makeRule());

    await updateDurationRule(24, { minHours: 3 });

    expect(mockPrisma.durationMultiplierRule.findFirst).toHaveBeenCalledTimes(1);
  });

  it('writes every sent field, and nothing that was not sent', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(makeRule());
    mockPrisma.durationMultiplierRule.update.mockResolvedValue(makeRule());

    await updateDurationRule(24, { multiplier: 0.75, label: 'Full day', isActive: false });
    expect(mockPrisma.durationMultiplierRule.update).toHaveBeenLastCalledWith({
      where: { id: 24 },
      data: { multiplier: 0.75, label: 'Full day', isActive: false },
    });

    await updateDurationRule(24, {});
    expect(mockPrisma.durationMultiplierRule.update).toHaveBeenLastCalledWith({
      where: { id: 24 },
      data: {},
    });
  });

  it('clears the label when it is sent as null', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(makeRule());
    mockPrisma.durationMultiplierRule.update.mockResolvedValue(makeRule({ label: null }));

    await updateDurationRule(24, { label: null });

    expect(mockPrisma.durationMultiplierRule.update).toHaveBeenCalledWith({
      where: { id: 24 },
      data: { label: null },
    });
  });

  it('refuses (404) to delete a missing or already-deleted tier', async () => {
    mockPrisma.durationMultiplierRule.findFirst.mockResolvedValue(null);
    await expect(deleteDurationRule(999)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Duration rule not found',
    });
    expect(mockPrisma.durationMultiplierRule.update).not.toHaveBeenCalled();
  });
});
