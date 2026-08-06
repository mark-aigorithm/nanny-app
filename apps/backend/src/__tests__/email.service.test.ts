import type { BookingWithRelations } from '@backend/services/booking.service';

// email.service only type-imports booking.service (erased), so this suite never
// pulls in the firebase/notification graph. Mock config, prisma and the SMTP
// transport; use the REAL renderer so the receipt template is exercised too.
jest.mock('@backend/lib/config', () => ({ config: { email: { enabled: true } } }));
jest.mock('@backend/db/prisma', () => ({ prisma: { emailLog: { create: jest.fn() } } }));
jest.mock('@backend/lib/email/transport', () => ({ sendEmail: jest.fn() }));

import { config } from '@backend/lib/config';
import { prisma } from '@backend/db/prisma';
import { sendEmail } from '@backend/lib/email/transport';
import { sendReceiptEmail } from '@backend/services/email.service';

const mockConfig = config as unknown as { email: { enabled: boolean } };
const mockCreate = (prisma as unknown as { emailLog: { create: jest.Mock } }).emailLog.create;
const mockSend = sendEmail as jest.Mock;

function buildBooking(): BookingWithRelations {
  return {
    id: 42,
    status: 'CONFIRMED',
    date: new Date('2026-08-06T00:00:00Z'),
    startTime: new Date('2026-08-06T07:00:00Z'),
    endTime: new Date('2026-08-06T10:00:00Z'),
    durationHours: 3,
    subtotal: 300,
    discountAmount: 50,
    totalAmount: 250,
    updatedAt: new Date('2026-08-06T07:05:00Z'),
    mother: { id: 7, email: 'sarah@example.com', firstName: 'Sarah', lastName: 'Hassan' },
    nannyProfile: { user: { firstName: 'Mona', lastName: 'Ali' } },
    payments: [
      {
        id: 900,
        currency: 'EGP',
        paymobTransactionId: 'TXN-555',
        paymobOrderId: 'ORD-1',
        updatedAt: new Date('2026-08-06T07:05:00Z'),
      },
    ],
  } as unknown as BookingWithRelations;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.email.enabled = true;
});

describe('sendReceiptEmail', () => {
  it('sends the receipt to the paying parent and logs it as SENT', async () => {
    mockSend.mockResolvedValue({ ok: true });

    await sendReceiptEmail({ booking: buildBooking(), paymobTransactionId: 'TXN-555' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'sarah@example.com',
        subject: expect.stringContaining('booking #42'),
        html: expect.stringContaining('Sarah'),
      }),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: 'sarah@example.com',
          userId: 7,
          template: 'RECEIPT',
          status: 'SENT',
          error: null,
          referenceType: 'BOOKING',
          referenceId: 42,
        }),
      }),
    );
  });

  it('logs FAILED with the transport error and does not throw when sending fails', async () => {
    mockSend.mockResolvedValue({ ok: false, error: 'smtp down' });

    await expect(sendReceiptEmail({ booking: buildBooking() })).resolves.toBeUndefined();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', error: 'smtp down' }),
      }),
    );
  });

  it('is a no-op with no send or log when email is not configured', async () => {
    mockConfig.email.enabled = false;

    await sendReceiptEmail({ booking: buildBooking() });

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('swallows a DB failure while logging so payment capture is never blocked', async () => {
    mockSend.mockResolvedValue({ ok: true });
    mockCreate.mockRejectedValue(new Error('db unavailable'));

    await expect(sendReceiptEmail({ booking: buildBooking() })).resolves.toBeUndefined();
  });
});
