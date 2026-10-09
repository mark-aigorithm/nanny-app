jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  };
  return { prisma: { appSettings } };
});

import { prisma } from '@backend/db/prisma';
import {
  clearCancellationCellProposal,
  getCancellationCellProposals,
  setCancellationCellProposal,
} from '@backend/services/cancellation-cell-proposal.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findMany: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
};

const KEY = 'cancellation_cell:mother-paid-inside.money';

const proposal = (over: Record<string, unknown> = {}) => ({
  choiceId: 'refund-percent-to-card',
  percent: 50,
  text: '',
  proposedBy: 'Sara',
  updatedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
  mockPrisma.appSettings.upsert.mockResolvedValue({});
  mockPrisma.appSettings.updateMany.mockResolvedValue({ count: 1 });
});

describe('getCancellationCellProposals', () => {
  it('reads only its own rows, and skips soft-deleted ones', async () => {
    await expect(getCancellationCellProposals()).resolves.toEqual({ entries: {} });
    expect(mockPrisma.appSettings.findMany).toHaveBeenCalledWith({
      where: { key: { startsWith: 'cancellation_cell:' }, deletedAt: null },
    });
  });

  it('returns each proposal keyed by scenario and column', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([{ key: KEY, value: JSON.stringify(proposal()) }]);
    const state = await getCancellationCellProposals();
    expect(state.entries['mother-paid-inside.money']).toEqual(proposal());
  });

  it('drops rows for a retired scenario, column or choice, and rows that do not parse', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      { key: 'cancellation_cell:retired-flow.money', value: JSON.stringify(proposal()) },
      { key: 'cancellation_cell:mother-paid-inside.retired', value: JSON.stringify(proposal()) },
      { key: KEY, value: JSON.stringify(proposal({ choiceId: 'retired-choice' })) },
      { key: 'cancellation_cell:mother-unpaid.money', value: 'not json' },
    ]);
    await expect(getCancellationCellProposals()).resolves.toEqual({ entries: {} });
  });
});

describe('setCancellationCellProposal', () => {
  it('stores the trimmed proposal under the cell and stamps it', async () => {
    const saved = await setCancellationCellProposal('mother-paid-inside', 'money', {
      choiceId: 'refund-percent-to-card',
      percent: 50,
      text: '  Only within 24 hours  ',
      proposedBy: ' Sara ',
    });

    expect(saved).toMatchObject({
      choiceId: 'refund-percent-to-card',
      percent: 50,
      text: 'Only within 24 hours',
      proposedBy: 'Sara',
    });
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(saved) },
      update: { value: JSON.stringify(saved), deletedAt: null },
    });
  });

  it.each([
    ['an unknown scenario', 'not-a-flow', 'money', { choiceId: 'no-refund' }, /Unknown scenario/],
    ['an unknown column', 'mother-paid-inside', 'nannyPay', { choiceId: 'no-refund' }, /Unknown column/],
    ['a choice of another column', 'mother-paid-inside', 'promoCode', { choiceId: 'no-refund' }, /Unknown choice/],
    ['a % choice without its number', 'mother-paid-inside', 'money', { choiceId: 'refund-percent-to-card' }, /needs a percentage/],
    ['"Something else" without text', 'mother-paid-inside', 'money', { choiceId: 'other' }, /Write what should happen/],
  ])('refuses %s', async (_label, flowId, outcome, input, message) => {
    await expect(setCancellationCellProposal(flowId, outcome, input)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(message),
    });
    expect(mockPrisma.appSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('clearCancellationCellProposal', () => {
  it('soft-deletes the cell', async () => {
    await clearCancellationCellProposal('mother-paid-inside', 'money');
    expect(mockPrisma.appSettings.updateMany).toHaveBeenCalledWith({
      where: { key: KEY, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('refuses a cell outside the table', async () => {
    await expect(clearCancellationCellProposal('mother-paid-inside', 'title')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.appSettings.updateMany).not.toHaveBeenCalled();
  });
});
