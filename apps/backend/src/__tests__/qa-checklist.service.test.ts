jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  return { prisma: { appSettings } };
});

import { QA_SCENARIOS } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import {
  getQaChecklist,
  resetQaChecklist,
  setQaScenarioStatus,
} from '@backend/services/qa-checklist.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
};

const realId = QA_SCENARIOS[0]!.id;
const otherRealId = QA_SCENARIOS[1]!.id;

/** An app_settings row as the DB would return it. */
const row = (scenarioId: string, entry: Record<string, unknown>) => ({
  key: `qa_checklist:${scenarioId}`,
  value: JSON.stringify(entry),
});

const entry = (over: Record<string, unknown> = {}) => ({
  status: 'PASS',
  note: '',
  tester: '',
  updatedAt: '2026-09-05T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
  mockPrisma.appSettings.upsert.mockResolvedValue({});
  mockPrisma.appSettings.deleteMany.mockResolvedValue({ count: 0 });
});

describe('getQaChecklist', () => {
  it('is empty before anyone has run anything', async () => {
    await expect(getQaChecklist()).resolves.toEqual({ entries: {} });
  });

  it('reads only the checklist rows, not the rest of app_settings', async () => {
    await getQaChecklist();

    expect(mockPrisma.appSettings.findMany).toHaveBeenCalledWith({
      where: { key: { startsWith: 'qa_checklist:' }, deletedAt: null },
    });
  });

  it('keys entries by scenario id, with the prefix stripped', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      row(realId, entry({ status: 'PASS', tester: 'MB' })),
      row(otherRealId, entry({ status: 'FAIL', note: 'nanny never appeared' })),
    ]);

    const { entries } = await getQaChecklist();

    expect(entries[realId]).toMatchObject({ status: 'PASS', tester: 'MB' });
    expect(entries[otherRealId]).toMatchObject({ status: 'FAIL', note: 'nanny never appeared' });
  });

  it('drops a row whose scenario has been retired from the catalogue', async () => {
    // Rows outlive the catalogue — a retired scenario must not resurrect as a
    // key the page cannot render.
    mockPrisma.appSettings.findMany.mockResolvedValue([
      row('a-scenario-that-no-longer-exists', entry()),
      row(realId, entry()),
    ]);

    const { entries } = await getQaChecklist();

    expect(Object.keys(entries)).toEqual([realId]);
  });

  it('treats an unparseable row as never-run rather than failing the whole checklist', async () => {
    // Losing one tick beats a page that will not load.
    mockPrisma.appSettings.findMany.mockResolvedValue([
      { key: `qa_checklist:${realId}`, value: 'not json at all' },
      row(otherRealId, entry({ status: 'BLOCKED' })),
    ]);

    const { entries } = await getQaChecklist();

    expect(entries[realId]).toBeUndefined();
    expect(entries[otherRealId]).toMatchObject({ status: 'BLOCKED' });
  });

  it('treats a row whose JSON no longer matches the shape as never-run', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      row(realId, { status: 'DONE', note: '', tester: '', updatedAt: 'x' }),
    ]);

    await expect(getQaChecklist()).resolves.toEqual({ entries: {} });
  });
});

describe('setQaScenarioStatus', () => {
  it('writes the entry under its namespaced key', async () => {
    const saved = await setQaScenarioStatus(realId, {
      status: 'PASS',
      note: '  looked good  ',
      tester: ' MB ',
    });

    expect(saved).toMatchObject({ status: 'PASS', note: 'looked good', tester: 'MB' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: `qa_checklist:${realId}` } }),
    );
  });

  it('defaults the free-text fields rather than storing undefined', async () => {
    const saved = await setQaScenarioStatus(realId, { status: 'BLOCKED' });

    expect(saved.note).toBe('');
    expect(saved.tester).toBe('');
    expect(saved.updatedAt).toEqual(expect.any(String));
  });

  it('revives a soft-deleted row instead of leaving the write invisible', async () => {
    await setQaScenarioStatus(realId, { status: 'PASS' });

    const call = mockPrisma.appSettings.upsert.mock.calls[0]![0] as { update: unknown };
    expect(call.update).toMatchObject({ deletedAt: null });
  });

  it('refuses a scenario id that is not in the catalogue, and writes nothing', async () => {
    // This allowlist is the whole reason an unauthenticated endpoint cannot
    // reach any other app_settings key.
    await expect(setQaScenarioStatus('not-a-real-scenario', { status: 'PASS' })).rejects.toThrow(
      /Unknown scenario/,
    );
    expect(mockPrisma.appSettings.upsert).not.toHaveBeenCalled();
  });

  it('refuses an id that tries to smuggle the prefix in', async () => {
    await expect(
      setQaScenarioStatus(`qa_checklist:${realId}`, { status: 'PASS' }),
    ).rejects.toThrow(/Unknown scenario/);
    expect(mockPrisma.appSettings.upsert).not.toHaveBeenCalled();
  });
});

describe('resetQaChecklist', () => {
  it('deletes only the checklist rows', async () => {
    mockPrisma.appSettings.deleteMany.mockResolvedValue({ count: 7 });

    await expect(resetQaChecklist()).resolves.toBe(7);
    expect(mockPrisma.appSettings.deleteMany).toHaveBeenCalledWith({
      where: { key: { startsWith: 'qa_checklist:' } },
    });
  });
});
