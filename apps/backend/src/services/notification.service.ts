import {
  type NotificationListQuery,
  type NotificationLink,
  type NotificationListResponse,
  type NotificationResponse,
  type PaginationMeta,
} from '@nanny-app/shared';
import type { CampaignTargetType, NotificationReferenceType, NotificationType, User } from '@prisma/client';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { firebaseMessaging } from '@backend/lib/firebase';
import type { DecodedIdToken } from '@backend/lib/firebase';

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

export function toApiNotificationType(type: NotificationType): NotificationResponse['type'] {
  switch (type as string) {
    case 'MARKETPLACE_MESSAGE':
      return 'marketplace_message';
    case 'BOOKING_REQUESTED':
      return 'booking_requested';
    case 'BOOKING_APPROVED':
      return 'booking_approved';
    case 'BOOKING_CONFIRMED':
      return 'booking_confirmed';
    case 'BOOKING_CANCELLED':
      return 'booking_cancelled';
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
    case 'POINTS_EARNED':
      return 'points_earned';
    case 'POINTS_GRANTED':
      return 'points_granted';
    case 'POINTS_REDEEMED':
      return 'points_redeemed';
    case 'REFERRAL_CONVERTED':
      return 'referral_converted';
    case 'REFERRAL_JOINED':
      return 'referral_joined';
    case 'CAMERA_REQUESTED':
      return 'camera_requested';
    case 'BOOKING_ENDED_BY_PARENT':
      return 'booking_ended_by_parent';
    case 'BOOKING_EXTENSION_REQUESTED':
      return 'booking_extension_requested';
    case 'BOOKING_EXTENSION_ACCEPTED':
      return 'booking_extension_accepted';
    case 'BOOKING_EXTENSION_DECLINED':
      return 'booking_extension_declined';
    case 'BOOKING_EXTENDED':
      return 'booking_extended';
    case 'MARKETPLACE_LISTING_APPROVED':
      return 'marketplace_listing_approved';
    case 'MARKETPLACE_LISTING_REJECTED':
      return 'marketplace_listing_rejected';
    case 'BOOKING_MESSAGE':
      return 'booking_message';
    case 'SURVEY':
      return 'survey';
    case 'ANNOUNCEMENT':
      return 'announcement';
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
    case 'COMMUNITY_POST':
      return 'community_post';
    case 'SURVEY':
      return 'survey';
    default:
      return null;
  }
}

/**
 * What an inbox row reads through its broadcast — the image and where a tap
 * goes. Read through the relation, not copied onto every row; the broadcast is
 * a snapshot, so editing the template later never changes a sent message.
 */
const BROADCAST_LINK_SELECT = {
  imageUrl: true,
  targetType: true,
  packageId: true,
  promoCodeText: true,
} as const;

type BroadcastLink = {
  imageUrl: string | null;
  targetType: CampaignTargetType | null;
  packageId: number | null;
  promoCodeText: string | null;
};

/** The tap target of an announcement; null for a plain one and for every other notification. */
export function toNotificationLink(broadcast: BroadcastLink | null | undefined): NotificationLink | null {
  if (!broadcast) return null;
  if (broadcast.targetType === 'PACKAGE' && broadcast.packageId != null) {
    return { type: 'package', packageId: broadcast.packageId };
  }
  if (broadcast.targetType === 'PROMO_CODE' && broadcast.promoCodeText) {
    return { type: 'promo_code', code: broadcast.promoCodeText };
  }
  return null;
}

function toNotificationResponse(row: {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  referenceId: number | null;
  referenceType: NotificationReferenceType | null;
  createdAt: Date;
  broadcast?: BroadcastLink | null;
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
    imageUrl: row.broadcast?.imageUrl ?? null,
    link: toNotificationLink(row.broadcast),
  };
}

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  referenceId?: number;
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

/** Many in-app rows in one insert — the survey fan-out writes one per mother. */
export async function createInAppNotifications(inputs: CreateNotificationInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const { count } = await prisma.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null,
    })),
  });
  return count;
}

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

/** FCM codes meaning a token will never work again: the app was removed or the token rotated. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

function isDeadToken(code: string | undefined): boolean {
  return code !== undefined && DEAD_TOKEN_CODES.has(code);
}

export async function dispatchPush(userId: number, payload: PushPayload): Promise<void> {
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
      if (isDeadToken(result.error?.code)) {
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

/** FCM's multicast limit. */
export const PUSH_MULTICAST_SIZE = 500;
/** Batches in flight at once: 10k mothers is ~20 calls, well inside the 60 s function limit. */
export const PUSH_CONCURRENCY = 4;

export interface BroadcastPushMessage {
  title: string;
  body: string;
  imageUrl?: string | null;
  data: Record<string, string>;
}

function multicastFor(tokens: string[], message: BroadcastPushMessage): MulticastMessage {
  const image = message.imageUrl ?? undefined;
  return {
    tokens,
    notification: { title: message.title, body: message.body, ...(image ? { imageUrl: image } : {}) },
    // Android shows the image in the banner. iOS banners stay text-only until a
    // Notification Service Extension ships (out of scope).
    ...(image ? { android: { notification: { imageUrl: image } } } : {}),
    data: message.data,
  };
}

/**
 * One message to many devices — the announcement fan-out. Tokens go out in
 * multicasts of 500, four at a time. A dead token is soft-deleted; any other
 * failure, or a whole call that throws, is only counted. Transactional pushes
 * keep using the per-user dispatchPush.
 */
export async function dispatchPushToTokens(
  tokens: string[],
  message: BroadcastPushMessage,
): Promise<{ sent: number; failed: number }> {
  const unique = [...new Set(tokens)];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += PUSH_MULTICAST_SIZE) {
    batches.push(unique.slice(i, i + PUSH_MULTICAST_SIZE));
  }

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  let next = 0;

  // Each worker takes the next unsent batch; taking it is synchronous, so no two share one.
  async function worker(): Promise<void> {
    while (next < batches.length) {
      const batch = batches[next];
      next += 1;
      if (!batch) return;
      let response: BatchResponse;
      try {
        response = await firebaseMessaging.sendEachForMulticast(multicastFor(batch, message));
      } catch {
        failed += batch.length;
        continue;
      }
      sent += response.successCount;
      failed += response.failureCount;
      response.responses.forEach((result, index) => {
        const token = batch[index];
        if (token && isDeadToken(result.error?.code)) dead.push(token);
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, batches.length) }, () => worker()));

  if (dead.length > 0) {
    try {
      await prisma.deviceToken.updateMany({
        where: { token: { in: dead }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    } catch {
      // Cleanup is best-effort: the messages are already out, so the tally must survive.
    }
  }
  return { sent, failed };
}

/** Kept well under Postgres' 32,767 bind parameters per statement. */
const TOKEN_LOOKUP_CHUNK = 10_000;

/** Every live push token of these users, chunked so a large audience stays one bind list per query. */
export async function listLiveDeviceTokens(userIds: number[]): Promise<{ userId: number; token: string }[]> {
  const tokens: { userId: number; token: string }[] = [];
  for (let i = 0; i < userIds.length; i += TOKEN_LOOKUP_CHUNK) {
    const rows = await prisma.deviceToken.findMany({
      where: { userId: { in: userIds.slice(i, i + TOKEN_LOOKUP_CHUNK) }, deletedAt: null },
      select: { userId: true, token: true },
    });
    tokens.push(...rows);
  }
  return tokens;
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
      include: { broadcast: { select: BROADCAST_LINK_SELECT } },
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
  notificationId: number,
): Promise<NotificationResponse> {
  const user = await getUserByUid(decoded.uid);

  const row = await prisma.notification.findFirst({
    where: { id: notificationId, userId: user.id, deletedAt: null },
  });
  if (!row) throw errors.notFound('Notification not found');

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
    include: { broadcast: { select: BROADCAST_LINK_SELECT } },
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
