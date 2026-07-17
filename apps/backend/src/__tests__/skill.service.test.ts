jest.mock('@backend/db/prisma', () => ({
  prisma: {
    skill: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createSkill,
  deleteSkill,
  listActiveSkills,
  listSkills,
  updateSkill,
} from '@backend/services/skill.service';

const mockPrisma = prisma as unknown as {
  skill: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makeSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: 26,
    name: 'French speaker',
    description: null,
    isActive: true,
    feeType: null,
    feeValue: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listSkills', () => {
  it('returns active-and-inactive skills as DTOs, name-ordered', async () => {
    mockPrisma.skill.findMany.mockResolvedValue([makeSkill()]);
    const rows = await listSkills();
    expect(mockPrisma.skill.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    expect(rows).toEqual([
      {
        id: 26,
        name: 'French speaker',
        description: null,
        isActive: true,
        feeType: null,
        feeValue: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('listActiveSkills', () => {
  it('queries only active, non-deleted skills and returns the public shape', async () => {
    mockPrisma.skill.findMany.mockResolvedValue([
      { id: 26, name: 'French speaker', feeType: 'FLAT', feeValue: 20 },
    ]);
    const rows = await listActiveSkills();
    expect(mockPrisma.skill.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, feeType: true, feeValue: true },
    });
    expect(rows).toEqual([
      { id: 26, name: 'French speaker', feeType: 'FLAT', feeValue: 20 },
    ]);
  });
});

describe('createSkill', () => {
  it('creates a new skill when the name is free', async () => {
    mockPrisma.skill.findUnique.mockResolvedValue(null);
    mockPrisma.skill.create.mockResolvedValue(makeSkill());
    const created = await createSkill({
      name: 'French speaker',
      isActive: true,
      feeType: 'FLAT',
      feeValue: 20,
    });
    expect(mockPrisma.skill.create).toHaveBeenCalledWith({
      data: { name: 'French speaker', description: null, isActive: true, feeType: 'FLAT', feeValue: 20 },
    });
    expect(created.id).toBe(26);
  });

  it('throws conflict (409) when a live skill with the same name exists', async () => {
    mockPrisma.skill.findUnique.mockResolvedValue(makeSkill());
    await expect(
      createSkill({ name: 'French speaker', isActive: true, feeType: null, feeValue: 0 }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.skill.create).not.toHaveBeenCalled();
  });

  it('allows reusing the name of a soft-deleted skill', async () => {
    mockPrisma.skill.findUnique.mockResolvedValue(makeSkill({ deletedAt: new Date() }));
    mockPrisma.skill.create.mockResolvedValue(makeSkill());
    await expect(
      createSkill({ name: 'French speaker', isActive: true, feeType: null, feeValue: 0 }),
    ).resolves.toBeDefined();
  });
});

describe('updateSkill', () => {
  it('throws notFound (404) when the skill is missing', async () => {
    mockPrisma.skill.findFirst.mockResolvedValue(null);
    await expect(updateSkill(999, { isActive: false })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('updates only provided fields', async () => {
    mockPrisma.skill.findFirst.mockResolvedValue(makeSkill());
    mockPrisma.skill.update.mockResolvedValue(makeSkill({ isActive: false }));
    const updated = await updateSkill(26, { isActive: false });
    expect(mockPrisma.skill.update).toHaveBeenCalledWith({
      where: { id: 26 },
      data: { isActive: false },
    });
    expect(updated.isActive).toBe(false);
  });

  it('throws conflict (409) when renaming onto another live skill', async () => {
    mockPrisma.skill.findFirst.mockResolvedValue(makeSkill({ name: 'Old name' }));
    mockPrisma.skill.findUnique.mockResolvedValue(makeSkill({ id: 27, name: 'Taken' }));
    await expect(updateSkill(26, { name: 'Taken' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.skill.update).not.toHaveBeenCalled();
  });
});

describe('deleteSkill', () => {
  it('throws notFound (404) when the skill is missing', async () => {
    mockPrisma.skill.findFirst.mockResolvedValue(null);
    await expect(deleteSkill(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('soft-deletes and returns the id', async () => {
    mockPrisma.skill.findFirst.mockResolvedValue(makeSkill());
    mockPrisma.skill.update.mockResolvedValue(makeSkill({ deletedAt: new Date() }));
    const result = await deleteSkill(26);
    expect(mockPrisma.skill.update).toHaveBeenCalledWith({
      where: { id: 26 },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result).toEqual({ id: 26 });
  });
});
