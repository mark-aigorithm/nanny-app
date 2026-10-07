jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  };
  return { prisma: { appSettings } };
});

import { CANCELLATION_DECISIONS } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import {
  clearCancellationDecision,
  getCancellationDecisions,
  setCancellationDecision,
} from '@backend/services/cancellation-policy.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findMany: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock };
};

const decision = CANCELLATION_DECISIONS[0]!;
const option = decision.options[1]!;
const otherDecision = CANCELLATION_DECISIONS[1]!;

const row = (decisionId: string, entry: Record<string, unknown>) => ({
  key: `cancellation_policy:${decisionId}`,
  value: JSON.stringify(entry),
});

const entry = (over: Record<string, unknown> = {}) => ({
  optionId: option.id,
  decidedBy: 'Sara',
  note: '',
  updatedAt: '2026-10-07T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
  mockPrisma.appSettings.upsert.mockResolvedValue({});
  mockPrisma.appSettings.updateMany.mockResolvedValue({ count: 1 });
});

describe('getCancellationDecisions', () => {
  it('is empty while nothing has been decided', async () => {
    await expect(getCancellationDecisions()).resolves.toEqual({ entries: {} });
  });

  it('reads only its own rows, and skips soft-deleted ones', async () => {
    await getCancellationDecisions();
    expect(mockPrisma.appSettings.findMany).toHaveBeenCalledWith({
      where: { key: { startsWith: 'cancellation_policy:' }, deletedAt: null },
    });
  });

  it('returns each recorded answer keyed by decision', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([row(decision.id, entry())]);
    const state = await getCancellationDecisions();
    expect(state.entries[decision.id]).toEqual(entry());
  });

  it('drops an answer whose option is no longer in the catalogue', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      row(decision.id, entry({ optionId: 'retired-option' })),
      row('retired-decision', entry()),
    ]);
    await expect(getCancellationDecisions()).resolves.toEqual({ entries: {} });
  });

  it('treats a row that does not parse as still open', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      { key: `cancellation_policy:${decision.id}`, value: 'not json' },
    ]);
    await expect(getCancellationDecisions()).resolves.toEqual({ entries: {} });
  });
});

describe('setCancellationDecision', () => {
  it('records the option with who decided and why, trimmed', async () => {
    const saved = await setCancellationDecision(decision.id, {
      optionId: option.id,
      decidedBy: '  Sara ',
      note: ' After the ops review ',
    });

    expect(saved).toMatchObject({ optionId: option.id, decidedBy: 'Sara', note: 'After the ops review' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: `cancellation_policy:${decision.id}` },
      create: { key: `cancellation_policy:${decision.id}`, value: JSON.stringify(saved) },
      update: { value: JSON.stringify(saved), deletedAt: null },
    });
  });

  it('refuses a decision outside the catalogue — the allowlist for an open endpoint', async () => {
    await expect(
      setCancellationDecision('service_fee_percent', { optionId: option.id }),
    ).rejects.toThrow('Unknown decision');
    expect(mockPrisma.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('refuses an option that belongs to another decision', async () => {
    const foreign = otherDecision.options.find(
      (o) => !decision.options.some((mine) => mine.id === o.id),
    )!;
    await expect(
      setCancellationDecision(decision.id, { optionId: foreign.id }),
    ).rejects.toThrow('Unknown option');
    expect(mockPrisma.appSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('clearCancellationDecision', () => {
  it('soft-deletes the answer so the decision reads as open again', async () => {
    await clearCancellationDecision(decision.id);
    expect(mockPrisma.appSettings.updateMany).toHaveBeenCalledWith({
      where: { key: `cancellation_policy:${decision.id}`, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('refuses a decision outside the catalogue', async () => {
    await expect(clearCancellationDecision('service_fee_percent')).rejects.toThrow('Unknown decision');
    expect(mockPrisma.appSettings.updateMany).not.toHaveBeenCalled();
  });
});
