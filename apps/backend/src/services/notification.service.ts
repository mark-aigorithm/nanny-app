import {
  type NotificationListQuery,
  type NotificationListResponse,
  type NotificationResponse,
  type PaginationMeta,
} from '@nanny-app/shared';
import {
  NotificationReferenceType,
  NotificationType,
  type User,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseMessaging } from '@backend/lib/firebase';
import type { DecodedIdToken } from '@backend/lib/firebase';

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function toApiNotificationType(type: NotificationType): NotificationResponse['type'] {
  switch (type as string) {
    case 'MARKETPLACE_MESSAGE':
      return 'marketplace_message';
    case 'NANNY_CHECKIN':
      return 'nanny_checkin';
    case 'BOOKING_COMPLETED':
      return 'booking_completed';
    case 'CARE_LOG_ENTRY':
      return 'care_log_entry';
    case 'NANNY_APPROVED':
      return 'nanny_approved';
    case 'NANNY_REJECTED':
      return 'nanny_rejected';
    default:
      return 'marketplace_message';
  }
}

function toApiReferenceType(
  type: NotificationReferenceType | null,
): NotificationResponse['referenceType'] {
  if (!type) return null;
  switch (type as string) {
    case 'CONVERSATION':
      return 'conversation';
    case 'BOOKING':
      return 'booking';
    default:
      return null;
  }
}

function toNotificationResponse(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  referenceId: string | null;
  referenceType: NotificationReferenceType | null;
  createdAt: Date;
}): NotificationResponse {
  return {
    id: row.id,
    type: toApiNotificationType(row.type),
    title: row.title,
    body: row.body,
    isRead: row.isRead,
    referenceId: row.referenceId,
    referenceType: toApiReferenceType(row.referenceType),
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceId?: string;
  referenceType?: NotificationReferenceType;
}

export async function createInAppNotification(
  input: CreateNotificationInput,
): Promise<NotificationResponse> {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null,
    },
  });

  return toNotificationResponse(row);
}

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

export async function dispatchPush(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId, deletedAt: null },
    select: { token: true },
  });

  if (tokens.length === 0) return;

  const tokenList = tokens.map((t) => t.token);

  try {
    const response = await firebaseMessaging.sendEachForMulticast({
      tokens: tokenList,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((result, index) => {
      if (
        result.error?.code === 'messaging/registration-token-not-registered' ||
        result.error?.code === 'messaging/invalid-registration-token'
      ) {
        const token = tokenList[index];
        if (token) invalidTokens.push(token);
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.deviceToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { deletedAt: new Date() },
      });
    }
  } catch {
    // Push failures should not block message delivery.
  }
}

export async function listNotifications(
  decoded: DecodedIdToken,
  query: NotificationListQuery,
): Promise<NotificationListResponse> {
  const user = await getUserByUid(decoded.uid);
  const skip = (query.page - 1) * query.limit;

  const where = {
    userId: user.id,
    deletedAt: null,
    ...(query.unreadOnly ? { isRead: false } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
  ]);

  const meta: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit) || 1,
  };

  return {
    notifications: rows.map(toNotificationResponse),
    meta,
  };
}

export async function getUnreadNotificationCount(
  decoded: DecodedIdToken,
): Promise<{ unreadCount: number }> {
  const user = await getUserByUid(decoded.uid);

  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, isRead: false, deletedAt: null },
  });

  return { unreadCount };
}

export async function markNotificationRead(
  decoded: DecodedIdToken,
  notificationId: string,
): Promise<NotificationResponse> {
  const user = await getUserByUid(decoded.uid);

  const row = await prisma.notification.findFirst({
    where: { id: notificationId, userId: user.id, deletedAt: null },
  });
  if (!row) throw errors.notFound('Notification not found');

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return toNotificationResponse(updated);
}

export async function markAllNotificationsRead(
  decoded: DecodedIdToken,
): Promise<{ updated: number }> {
  const user = await getUserByUid(decoded.uid);

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false, deletedAt: null },
    data: { isRead: true },
  });

  return { updated: result.count };
}
