jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findFirst: jest.fn(),
    upsert: jest.fn(),
  };
  return { prisma: { appSettings } };
});

import { prisma } from '@backend/db/prisma';
import { getSupportFaq, updateSupportFaq } from '@backend/services/support-faq.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findFirst: jest.Mock; upsert: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findFirst.mockResolvedValue(null);
});

describe('getSupportFaq', () => {
  it('answers with the built-in questions until an operator has written any', async () => {
    const { items } = await getSupportFaq();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual({
      question: 'How are nannies vetted?',
      answer: expect.stringMatching(/background check/i),
    });
  });

  it('returns what the operator saved, in the order it was saved', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      key: 'support_faq',
      value: JSON.stringify([
        { question: 'Do you cover Alexandria?', answer: 'Not yet — Cairo only.' },
        { question: 'Can I pay cash?', answer: 'No. Card only, through the app.' },
      ]),
    });

    const { items } = await getSupportFaq();
    expect(items.map((i) => i.question)).toEqual(['Do you cover Alexandria?', 'Can I pay cash?']);
  });

  it('treats a row that will not parse as unset rather than crashing the screen', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({ key: 'support_faq', value: 'not json' });
    const { items } = await getSupportFaq();
    expect(items[0]?.question).toBe('How are nannies vetted?');
  });
});

describe('updateSupportFaq', () => {
  it('stores the list as one JSON row and reads it back', async () => {
    const saved = [{ question: '  Do you cover Alexandria?  ', answer: 'Not yet.' }];
    mockPrisma.appSettings.upsert.mockResolvedValue({});
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      key: 'support_faq',
      value: JSON.stringify([{ question: 'Do you cover Alexandria?', answer: 'Not yet.' }]),
    });

    const result = await updateSupportFaq({ items: saved });

    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_faq' },
      create: {
        key: 'support_faq',
        value: JSON.stringify([{ question: 'Do you cover Alexandria?', answer: 'Not yet.' }]),
      },
      update: {
        value: JSON.stringify([{ question: 'Do you cover Alexandria?', answer: 'Not yet.' }]),
        deletedAt: null,
      },
    });
    expect(result.items).toEqual([{ question: 'Do you cover Alexandria?', answer: 'Not yet.' }]);
  });

  it('lets an operator clear the list entirely', async () => {
    mockPrisma.appSettings.upsert.mockResolvedValue({});
    mockPrisma.appSettings.findFirst.mockResolvedValue({ key: 'support_faq', value: '[]' });

    const result = await updateSupportFaq({ items: [] });
    expect(result.items).toEqual([]);
  });
});
