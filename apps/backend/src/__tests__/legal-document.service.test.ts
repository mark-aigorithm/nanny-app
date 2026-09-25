jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  };
  return { prisma: { appSettings } };
});

import { prisma } from '@backend/db/prisma';
import {
  getLegalDocument,
  getLegalDocuments,
  updateLegalDocument,
} from '@backend/services/legal-document.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findFirst: jest.Mock; upsert: jest.Mock };
};

const SAVED_TERMS = { title: 'Terms', body: 'Be kind.', updatedAt: '2026-09-01T10:00:00.000Z' };

function storeRow(value: unknown): void {
  mockPrisma.appSettings.findFirst.mockResolvedValue({
    key: 'legal_documents',
    value: typeof value === 'string' ? value : JSON.stringify(value),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findFirst.mockResolvedValue(null);
});

describe('getLegalDocument', () => {
  it('reads as a placeholder, with no date, until an operator has written it', async () => {
    await expect(getLegalDocument('terms')).resolves.toEqual({
      key: 'terms',
      title: 'Terms of Service',
      body: expect.stringMatching(/will be published here soon/),
      updatedAt: null,
    });
    await expect(getLegalDocument('privacy')).resolves.toMatchObject({
      key: 'privacy',
      title: 'Privacy Policy',
      updatedAt: null,
    });
  });

  it('returns what the operator saved', async () => {
    storeRow({ terms: SAVED_TERMS });
    await expect(getLegalDocument('terms')).resolves.toEqual({ key: 'terms', ...SAVED_TERMS });
  });

  it('keeps one saved document when the other is missing or broken', async () => {
    storeRow({ terms: SAVED_TERMS, privacy: { title: '' } });
    await expect(getLegalDocument('terms')).resolves.toMatchObject({ body: 'Be kind.' });
    await expect(getLegalDocument('privacy')).resolves.toMatchObject({ updatedAt: null });
  });

  it('treats a row that will not parse as unset rather than crashing the screen', async () => {
    storeRow('not json');
    await expect(getLegalDocument('terms')).resolves.toMatchObject({ updatedAt: null });
    storeRow('null');
    await expect(getLegalDocument('terms')).resolves.toMatchObject({ updatedAt: null });
  });
});

describe('getLegalDocuments', () => {
  it('returns both, for the console', async () => {
    storeRow({ terms: SAVED_TERMS });
    const docs = await getLegalDocuments();
    expect(docs.terms).toEqual({ key: 'terms', ...SAVED_TERMS });
    expect(docs.privacy).toMatchObject({ key: 'privacy', updatedAt: null });
  });
});

describe('updateLegalDocument', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T12:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves one document, stamps it, and keeps the other as it was', async () => {
    storeRow({ terms: SAVED_TERMS });

    const saved = await updateLegalDocument('privacy', { title: ' Privacy ', body: ' We keep little. ' });

    expect(saved).toEqual({
      key: 'privacy',
      title: 'Privacy',
      body: 'We keep little.',
      updatedAt: '2026-09-25T12:00:00.000Z',
    });
    const [{ where, create, update }] = mockPrisma.appSettings.upsert.mock.calls[0] as [
      { where: unknown; create: { value: string }; update: { value: string; deletedAt: null } },
    ];
    expect(where).toEqual({ key: 'legal_documents' });
    expect(JSON.parse(create.value)).toEqual({
      terms: SAVED_TERMS,
      privacy: { title: 'Privacy', body: 'We keep little.', updatedAt: '2026-09-25T12:00:00.000Z' },
    });
    expect(update).toEqual({ value: create.value, deletedAt: null });
  });

  it('writes the first document into an empty row', async () => {
    await updateLegalDocument('terms', { title: 'Terms', body: 'Be kind.' });
    const [{ create }] = mockPrisma.appSettings.upsert.mock.calls[0] as [{ create: { value: string } }];
    expect(Object.keys(JSON.parse(create.value))).toEqual(['terms']);
  });
});
