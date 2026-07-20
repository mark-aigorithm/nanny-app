jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findMany: jest.fn(),
    upsert: jest.fn(),
  };
  return {
    prisma: {
      appSettings,
      $transaction: jest.fn(async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as () => unknown)(),
      ),
    },
  };
});

import { prisma } from '@backend/db/prisma';
import {
  getSupportContact,
  updateSupportContact,
} from '@backend/services/support-contact.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findMany: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};

/** app_settings rows as the DB would return them. */
const rows = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
});

describe('getSupportContact', () => {
  it('returns empty strings when nothing is seeded, so no card renders', async () => {
    await expect(getSupportContact()).resolves.toEqual({
      whatsappNumber: '',
      phoneNumber: '',
      email: '',
    });
  });

  it('returns seeded values', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(
      rows({
        support_whatsapp_number: '+201001234567',
        support_phone_number: '+201009999999',
        support_email: 'support@nannynow.com',
      }),
    );
    await expect(getSupportContact()).resolves.toEqual({
      whatsappNumber: '+201001234567',
      phoneNumber: '+201009999999',
      email: 'support@nannynow.com',
    });
  });

  it('filters out soft-deleted rows', async () => {
    await getSupportContact();
    expect(mockPrisma.appSettings.findMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['support_whatsapp_number', 'support_phone_number', 'support_email'] },
        deletedAt: null,
      },
    });
  });
});

describe('updateSupportContact', () => {
  it('writes only the fields provided', async () => {
    await updateSupportContact({ phoneNumber: '+201001234567' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_phone_number' },
      create: { key: 'support_phone_number', value: '+201001234567' },
      update: { value: '+201001234567', deletedAt: null },
    });
  });

  it('normalizes a number before storing it', async () => {
    await updateSupportContact({ whatsappNumber: '+20 100 123-4567' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_whatsapp_number' },
      create: { key: 'support_whatsapp_number', value: '+201001234567' },
      update: { value: '+201001234567', deletedAt: null },
    });
  });

  it('trims but does not strip dashes from an email', async () => {
    await updateSupportContact({ email: '  help-desk@nannynow.com ' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_email' },
      create: { key: 'support_email', value: 'help-desk@nannynow.com' },
      update: { value: 'help-desk@nannynow.com', deletedAt: null },
    });
  });

  it('accepts an empty string, blanking a channel', async () => {
    await updateSupportContact({ whatsappNumber: '' });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledWith({
      where: { key: 'support_whatsapp_number' },
      create: { key: 'support_whatsapp_number', value: '' },
      update: { value: '', deletedAt: null },
    });
  });

  it('ignores undefined fields rather than blanking them', async () => {
    await updateSupportContact({ phoneNumber: '+201001234567', email: undefined });
    expect(mockPrisma.appSettings.upsert).toHaveBeenCalledTimes(1);
  });

  it('writes atomically and returns the full resulting contact', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(
      rows({ support_phone_number: '+201001234567' }),
    );
    await expect(updateSupportContact({ phoneNumber: '+201001234567' })).resolves.toEqual({
      whatsappNumber: '',
      phoneNumber: '+201001234567',
      email: '',
    });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
