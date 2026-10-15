import {
  type BookingChatSummary,
  type BookingMessageHistoryQuery,
  type BookingMessageListResponse,
  type BookingMessageResponse,
  type SendBookingMessageRequest,
} from '@nanny-app/shared';
import {
  BookingStatus,
  NotificationReferenceType,
  NotificationType,
  type User,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

const NOTIFICATION_PREVIEW_LENGTH = 100;

/** The most an admin transcript returns — far more than one shift produces. */
const ADMIN_TRANSCRIPT_LIMIT = 1000;

type ChatBooking = {
  id: number;
  status: BookingStatus;
  motherId: number;
  nannyProfile: { userId: number } | null;
};

type MessageRow = {
  id: number;
  bookingId: number;
  senderId: number;
  content: string;
  createdAt: Date;
  sender: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
};

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

async function findChatBooking(bookingId: number): Promise<ChatBooking> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    select: { id: true, status: true, motherId: true, nannyProfile: { select: { userId: true } } },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  return booking;
}

/**
 * The booking's mother or its *current* nanny. Anyone else — a nanny who was
 * reassigned off it included — gets the same 404 as a booking that doesn't
 * exist, so the chat can't be probed for.
 */
async function loadChatParticipant(decoded: DecodedIdToken, bookingId: number) {
  const user = await getUserByUid(decoded.uid);
  const booking = await findChatBooking(bookingId);
  const isMother = booking.motherId === user.id;
  const isNanny = booking.nannyProfile?.userId === user.id;
  if (!isMother && !isNanny) throw errors.notFound('Booking not found.');
  const otherUserId = isMother ? booking.nannyProfile?.userId ?? null : booking.motherId;
  return { user, booking, otherUserId };
}

function toMessageResponse(row: MessageRow, motherId: number): BookingMessageResponse {
  return {
    id: row.id,
    bookingId: row.bookingId,
    content: row.content,
    sender: {
      id: row.sender.id,
      firstName: row.sender.firstName,
      lastName: row.sender.lastName,
      avatarUrl: row.sender.avatarUrl,
      role: row.senderId === motherId ? 'MOTHER' : 'NANNY',
    },
    createdAt: row.createdAt.toISOString(),
  };
}

const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} as const;

function previewOf(content: string): string {
  return content.length > NOTIFICATION_PREVIEW_LENGTH
    ? `${content.slice(0, NOTIFICATION_PREVIEW_LENGTH - 1)}…`
    : content;
}

async function notifyRecipient(
  bookingId: number,
  recipientId: number,
  senderFirstName: string,
  content: string,
): Promise<void> {
  const title = 'New message';
  const body = `${senderFirstName}: ${previewOf(content)}`;

  await createInAppNotification({
    userId: recipientId,
    type: NotificationType.BOOKING_MESSAGE,
    title,
    body,
    referenceId: bookingId,
    referenceType: NotificationReferenceType.BOOKING,
  });

  await dispatchPush(recipientId, {
    title,
    body,
    data: { type: 'BOOKING_MESSAGE', bookingId: String(bookingId) },
  });
}

function markRead(bookingId: number, userId: number, at: Date) {
  return prisma.bookingChatRead.upsert({
    where: { bookingId_userId: { bookingId, userId } },
    create: { bookingId, userId, lastReadAt: at },
    update: { lastReadAt: at, deletedAt: null },
  });
}

export async function listBookingMessages(
  decoded: DecodedIdToken,
  bookingId: number,
  query: BookingMessageHistoryQuery,
): Promise<BookingMessageListResponse> {
  const { booking } = await loadChatParticipant(decoded, bookingId);

  const rows = await prisma.bookingMessage.findMany({
    where: {
      bookingId,
      deletedAt: null,
      ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
    },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: query.limit + 1,
  });

  const hasMore = rows.length > query.limit;
  const messages = rows
    .slice(0, query.limit)
    .reverse()
    .map((row) => toMessageResponse(row, booking.motherId));
  return { messages, hasMore };
}

export async function sendBookingMessage(
  decoded: DecodedIdToken,
  bookingId: number,
  body: SendBookingMessageRequest,
): Promise<BookingMessageResponse> {
  const { user, booking, otherUserId } = await loadChatParticipant(decoded, bookingId);

  if (booking.status !== BookingStatus.IN_PROGRESS) {
    throw errors.conflict('Messages can only be sent while the booking is in progress.');
  }

  const created = await prisma.bookingMessage.create({
    data: { bookingId, senderId: user.id, content: body.content },
    include: messageInclude,
  });
  await markRead(bookingId, user.id, created.createdAt);

  // Awaited, not fire-and-forget: on serverless hosting the function may be
  // frozen once the response is sent, taking an unsent push with it. A failure
  // is logged and never fails the send — the message itself is already stored.
  if (otherUserId !== null) {
    try {
      await notifyRecipient(bookingId, otherUserId, user.firstName, created.content);
    } catch (err) {
      console.warn(`Booking chat notification failed for booking ${bookingId}`, err);
    }
  }

  return toMessageResponse(created, booking.motherId);
}

export async function markBookingChatRead(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<{ read: true }> {
  const { user } = await loadChatParticipant(decoded, bookingId);
  await markRead(bookingId, user.id, new Date());
  return { read: true };
}

export async function getBookingChatSummary(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<BookingChatSummary> {
  const { user, booking } = await loadChatParticipant(decoded, bookingId);

  const read = await prisma.bookingChatRead.findUnique({
    where: { bookingId_userId: { bookingId, userId: user.id } },
  });
  const lastReadAt = read && !read.deletedAt ? read.lastReadAt : null;

  const messageCount = await prisma.bookingMessage.count({
    where: { bookingId, deletedAt: null },
  });
  const unreadCount = await prisma.bookingMessage.count({
    where: {
      bookingId,
      deletedAt: null,
      senderId: { not: user.id },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });

  return { canSend: booking.status === BookingStatus.IN_PROGRESS, messageCount, unreadCount };
}

/** The console's read-only transcript. Section access is enforced by the admin router. */
export async function listAdminBookingMessages(
  bookingId: number,
): Promise<BookingMessageListResponse> {
  const booking = await findChatBooking(bookingId);

  const rows = await prisma.bookingMessage.findMany({
    where: { bookingId, deletedAt: null },
    include: messageInclude,
    orderBy: { createdAt: 'asc' },
    take: ADMIN_TRANSCRIPT_LIMIT,
  });

  return {
    messages: rows.map((row) => toMessageResponse(row, booking.motherId)),
    hasMore: rows.length === ADMIN_TRANSCRIPT_LIMIT,
  };
}
