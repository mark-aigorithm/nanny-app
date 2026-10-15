import { BookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn() },
    bookingMessage: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
    bookingChatRead: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import {
  getBookingChatSummary,
  listAdminBookingMessages,
  listBookingMessages,
  markBookingChatRead,
  sendBookingMessage,
} from '@backend/services/booking-chat.service';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock };
  bookingMessage: { findMany: jest.Mock; create: jest.Mock; count: jest.Mock };
  bookingChatRead: { findUnique: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};
const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const mother = { id: 1, firebaseUid: 'uid-mother', firstName: 'Mona', lastName: 'Adel', avatarUrl: null, deletedAt: null };
const nanny = { id: 2, firebaseUid: 'uid-nanny', firstName: 'Sara', lastName: 'Nabil', avatarUrl: null, deletedAt: null };
const outsider = { id: 3, firebaseUid: 'uid-out', firstName: 'X', lastName: 'Y', avatarUrl: null, deletedAt: null };
const USERS: Record<string, typeof mother> = {
  'uid-mother': mother,
  'uid-nanny': nanny,
  'uid-out': outsider,
};

function booking(status: BookingStatus, nannyUserId: number | null = nanny.id) {
  return {
    id: 7,
    status,
    motherId: mother.id,
    deletedAt: null,
    nannyProfile: nannyUserId ? { userId: nannyUserId } : null,
  };
}

const as = (uid: string) => ({ uid }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockImplementation(({ where }: { where: { firebaseUid: string } }) =>
    Promise.resolve(USERS[where.firebaseUid] ?? null),
  );
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
});

describe('access', () => {
  it('hides the booking from someone who is not on it', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    await expect(listBookingMessages(as('uid-out'), 7, { limit: 50 })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('hides it from a nanny who was reassigned off it', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS, 99));
    await expect(
      sendBookingMessage(as('uid-nanny'), 7, { content: 'hi' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.bookingMessage.create).not.toHaveBeenCalled();
  });

  it('404s a booking that does not exist', async () => {
    db.booking.findUnique.mockResolvedValue(null);
    await expect(getBookingChatSummary(as('uid-mother'), 7)).rejects.toBeInstanceOf(AppError);
  });
});

describe('sendBookingMessage', () => {
  const created = {
    id: 50,
    bookingId: 7,
    senderId: mother.id,
    content: 'Nap at 1pm please',
    createdAt: new Date('2026-10-15T10:00:00Z'),
    sender: mother,
  };

  it.each([
    BookingStatus.PENDING,
    BookingStatus.APPROVED,
    BookingStatus.PENDING_CONFIRMATION,
    BookingStatus.CONFIRMED,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.REFUNDED,
  ])('refuses to send while %s', async (status) => {
    db.booking.findUnique.mockResolvedValue(booking(status));
    await expect(
      sendBookingMessage(as('uid-mother'), 7, { content: 'hi' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Messages can only be sent while the booking is in progress.',
    });
    expect(db.bookingMessage.create).not.toHaveBeenCalled();
  });

  it('stores the message, marks the sender read, and tells only the other side', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue(created);

    const res = await sendBookingMessage(as('uid-mother'), 7, { content: 'Nap at 1pm please' });

    expect(res).toEqual({
      id: 50,
      bookingId: 7,
      content: 'Nap at 1pm please',
      sender: { id: 1, firstName: 'Mona', lastName: 'Adel', avatarUrl: null, role: 'MOTHER' },
      createdAt: '2026-10-15T10:00:00.000Z',
    });
    expect(db.bookingChatRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId_userId: { bookingId: 7, userId: 1 } } }),
    );
    await new Promise((r) => setImmediate(r));
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: nanny.id,
        type: 'BOOKING_MESSAGE',
        title: 'New message',
        body: 'Mona: Nap at 1pm please',
        referenceId: 7,
        referenceType: 'BOOKING',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(nanny.id, {
      title: 'New message',
      body: 'Mona: Nap at 1pm please',
      data: { type: 'BOOKING_MESSAGE', bookingId: '7' },
    });
  });

  it('labels a nanny-sent message as NANNY and notifies the mother', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue({ ...created, senderId: nanny.id, sender: nanny });

    const res = await sendBookingMessage(as('uid-nanny'), 7, { content: 'Done' });

    expect(res.sender.role).toBe('NANNY');
    await new Promise((r) => setImmediate(r));
    expect(mockPush).toHaveBeenCalledWith(mother.id, expect.anything());
  });

  it('cuts a long message to 100 characters in the notification', async () => {
    const long = 'x'.repeat(150);
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue({ ...created, content: long });

    await sendBookingMessage(as('uid-mother'), 7, { content: long });
    await new Promise((r) => setImmediate(r));

    expect(mockNotify.mock.calls[0][0].body).toBe(`Mona: ${'x'.repeat(99)}…`);
  });

  it('has notified the other side by the time it responds (serverless may stop after)', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue(created);
    mockNotify.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r({}), 20)));

    await sendBookingMessage(as('uid-mother'), 7, { content: 'Nap at 1pm please' });

    expect(mockPush).toHaveBeenCalledWith(nanny.id, expect.anything());
  });

  it('logs a notification failure', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue(created);
    mockNotify.mockRejectedValueOnce(new Error('fcm down'));

    await sendBookingMessage(as('uid-mother'), 7, { content: 'Nap at 1pm please' });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('booking 7'), expect.any(Error));
    warn.mockRestore();
  });

  it('still returns the message when the notification fails', async () => {
    jest.spyOn(console, 'warn').mockImplementationOnce(() => undefined);
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.create.mockResolvedValue(created);
    mockNotify.mockRejectedValueOnce(new Error('fcm down'));

    await expect(
      sendBookingMessage(as('uid-mother'), 7, { content: 'Nap at 1pm please' }),
    ).resolves.toMatchObject({ id: 50 });
  });
});

describe('listBookingMessages', () => {
  it('returns a page oldest-first and says whether there is more', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    const row = (id: number, minute: number) => ({
      id,
      bookingId: 7,
      senderId: nanny.id,
      content: `m${id}`,
      createdAt: new Date(`2026-10-15T10:${String(minute).padStart(2, '0')}:00Z`),
      sender: nanny,
    });
    // Newest first from the DB, limit + 1 rows.
    db.bookingMessage.findMany.mockResolvedValue([row(3, 3), row(2, 2), row(1, 1)]);

    const res = await listBookingMessages(as('uid-mother'), 7, { limit: 2 });

    expect(res.hasMore).toBe(true);
    expect(res.messages.map((m) => m.id)).toEqual([2, 3]);
    expect(db.bookingMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId: 7, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    );
  });

  it('pages back from a cursor', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingMessage.findMany.mockResolvedValue([]);
    const cursor = '2026-10-15T10:02:00.000Z';

    await listBookingMessages(as('uid-mother'), 7, { limit: 50, cursor });

    expect(db.bookingMessage.findMany.mock.calls[0][0].where).toEqual({
      bookingId: 7,
      deletedAt: null,
      createdAt: { lt: new Date(cursor) },
    });
  });
});

describe('getBookingChatSummary', () => {
  it('counts what the other side sent since she last read', async () => {
    const lastReadAt = new Date('2026-10-15T10:00:00Z');
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.IN_PROGRESS));
    db.bookingChatRead.findUnique.mockResolvedValue({ lastReadAt });
    db.bookingMessage.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);

    const res = await getBookingChatSummary(as('uid-mother'), 7);

    expect(res).toEqual({ canSend: true, messageCount: 5, unreadCount: 2 });
    expect(db.bookingMessage.count.mock.calls[1][0].where).toEqual({
      bookingId: 7,
      deletedAt: null,
      senderId: { not: mother.id },
      createdAt: { gt: lastReadAt },
    });
  });

  it('cannot send once the booking is over, and counts everything unread if never opened', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    db.bookingChatRead.findUnique.mockResolvedValue(null);
    db.bookingMessage.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);

    const res = await getBookingChatSummary(as('uid-nanny'), 7);

    expect(res).toEqual({ canSend: false, messageCount: 3, unreadCount: 3 });
    expect(db.bookingMessage.count.mock.calls[1][0].where).toEqual({
      bookingId: 7,
      deletedAt: null,
      senderId: { not: nanny.id },
    });
  });
});

describe('markBookingChatRead', () => {
  it('upserts the read marker for the caller', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    await expect(markBookingChatRead(as('uid-nanny'), 7)).resolves.toEqual({ read: true });
    expect(db.bookingChatRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId_userId: { bookingId: 7, userId: nanny.id } },
        create: expect.objectContaining({ bookingId: 7, userId: nanny.id }),
      }),
    );
  });
});

describe('listAdminBookingMessages', () => {
  it('returns the whole chat oldest first with sender roles', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.COMPLETED));
    db.bookingMessage.findMany.mockResolvedValue([
      { id: 1, bookingId: 7, senderId: mother.id, content: 'a', createdAt: new Date('2026-10-15T10:00:00Z'), sender: mother },
      { id: 2, bookingId: 7, senderId: nanny.id, content: 'b', createdAt: new Date('2026-10-15T10:01:00Z'), sender: nanny },
    ]);

    const res = await listAdminBookingMessages(7);

    expect(res.hasMore).toBe(false);
    expect(res.messages.map((m) => m.sender.role)).toEqual(['MOTHER', 'NANNY']);
    expect(db.bookingMessage.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  it('404s an unknown booking', async () => {
    db.booking.findUnique.mockResolvedValue(null);
    await expect(listAdminBookingMessages(7)).rejects.toMatchObject({ statusCode: 404 });
  });
});
