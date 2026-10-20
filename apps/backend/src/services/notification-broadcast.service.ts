import { NotificationBroadcastStatus, NotificationChannel, NotificationType, type Prisma } from '@prisma/client';

import type { NotificationBroadcast } from '@nanny-app/shared';
import { BROADCAST_STALE_MS, NotificationAudienceSchema } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  BROADCAST_INCLUDE,
  resolveNotificationAudience,
  toBroadcastDto,
} from '@backend/services/admin-notification-template.service';
import { dispatchPushToTokens, listLiveDeviceTokens } from '@backend/services/notification.service';

/** In-app rows per insert. */
export const IN_APP_CHUNK = 1_000;

const WITH_LINK = { package: true, promoCode: true } as const;
type LinkedTemplate = Prisma.NotificationTemplateGetPayload<{ include: typeof WITH_LINK }>;

/**
 * The link must still lead somewhere a mother can use: a tap on a dead package
 * or an exhausted code would end in an error screen.
 */
function assertLinkUsable(template: LinkedTemplate, now: Date): void {
  if (template.targetType === 'PACKAGE') {
    const pkg = template.package;
    if (!pkg || pkg.deletedAt) throw errors.badRequest('That package no longer exists.');
    if (!pkg.isActive) throw errors.badRequest('That package is no longer active.');
    if (pkg.expiresAt && pkg.expiresAt <= now) throw errors.badRequest('That package has expired.');
  }
  if (template.targetType === 'PROMO_CODE') {
    const promo = template.promoCode;
    if (!promo || promo.deletedAt) throw errors.badRequest('That promo code no longer exists.');
    if (!promo.isActive) throw errors.badRequest('That promo code is no longer active.');
    if (promo.expiresAt && promo.expiresAt <= now) throw errors.badRequest('That promo code has expired.');
    if (promo.maxUsage != null && promo.usageCount >= promo.maxUsage) {
      throw errors.badRequest('That promo code has been used up.');
    }
  }
}

/** FCM data values must be strings; absent keys are left out, not sent empty. */
function pushData(broadcastId: number, template: LinkedTemplate): Record<string, string> {
  const data: Record<string, string> = { type: 'ANNOUNCEMENT', broadcastId: String(broadcastId) };
  if (template.targetType === 'PACKAGE' && template.packageId != null) {
    data.targetType = 'PACKAGE';
    data.packageId = String(template.packageId);
  }
  if (template.targetType === 'PROMO_CODE' && template.promoCode) {
    data.targetType = 'PROMO_CODE';
    data.promoCode = template.promoCode.code;
  }
  return data;
}

/**
 * Sends a template now (spec, "Publish flow"): validate the link, resolve the
 * audience, claim the send with a SENDING broadcast, write the inbox rows,
 * push, then record the outcome. In-request: Vercel has no worker, and token
 * batching keeps 10k mothers to ~20 FCM calls.
 */
export async function publishNotificationTemplate(templateId: number, adminId: number): Promise<NotificationBroadcast> {
  const template = await prisma.notificationTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
    include: WITH_LINK,
  });
  if (!template) throw errors.notFound('Notification template not found.');
  assertLinkUsable(template, new Date());

  const audience = NotificationAudienceSchema.parse(template.audience);
  const { userIds, skippedGroupIds } = await resolveNotificationAudience(audience);
  if (userIds.length === 0) throw errors.badRequest('No mothers match this audience.');

  const claimed = await prisma.$transaction(async (tx) => {
    // Serialise publishes of this template: a double-click or a second admin
    // waits here until the first has committed its SENDING row, then sees it.
    await tx.$queryRaw`SELECT id FROM notification_templates WHERE id = ${templateId} FOR UPDATE`;
    const inFlight = await tx.notificationBroadcast.findFirst({
      where: {
        templateId,
        status: NotificationBroadcastStatus.SENDING,
        // One stuck longer than this was killed mid-send; it reads as timed out and no longer blocks.
        createdAt: { gt: new Date(Date.now() - BROADCAST_STALE_MS) },
      },
      select: { id: true },
    });
    if (inFlight) throw errors.conflict('This notification is already being sent.');

    return tx.notificationBroadcast.create({
      data: {
        templateId,
        title: template.title,
        body: template.body,
        imageUrl: template.imageUrl,
        channel: template.channel,
        targetType: template.targetType,
        packageId: template.packageId,
        promoCodeId: template.promoCodeId,
        // The code itself, so a tap opens the booking flow without a lookup.
        promoCodeText: template.targetType === 'PROMO_CODE' ? (template.promoCode?.code ?? null) : null,
        audience: audience as Prisma.InputJsonValue,
        targeted: userIds.length,
        skippedGroups: skippedGroupIds,
        publishedById: adminId,
      },
      select: { id: true },
    });
  });

  return deliver(claimed.id, template, userIds);
}

async function deliver(broadcastId: number, template: LinkedTemplate, userIds: number[]): Promise<NotificationBroadcast> {
  const counts = { inAppCreated: 0, pushSent: 0, pushFailed: 0, noDevice: 0 };
  let status: NotificationBroadcastStatus = NotificationBroadcastStatus.SENT;
  let error: string | null = null;

  try {
    if (template.channel !== NotificationChannel.PUSH) {
      // A failed chunk stops here (caught below): FAILED with the rows so far, and no push.
      for (let i = 0; i < userIds.length; i += IN_APP_CHUNK) {
        const { count } = await prisma.notification.createMany({
          data: userIds.slice(i, i + IN_APP_CHUNK).map((userId) => ({
            userId,
            type: NotificationType.ANNOUNCEMENT,
            title: template.title,
            body: template.body,
            broadcastId,
          })),
        });
        counts.inAppCreated += count;
      }
    }

    if (template.channel !== NotificationChannel.IN_APP) {
      const tokens = await listLiveDeviceTokens(userIds);
      counts.noDevice = userIds.length - new Set(tokens.map((t) => t.userId)).size;
      const { sent, failed } = await dispatchPushToTokens(
        tokens.map((t) => t.token),
        { title: template.title, body: template.body, imageUrl: template.imageUrl, data: pushData(broadcastId, template) },
      );
      counts.pushSent = sent;
      counts.pushFailed = failed;
      if (failed > 0) status = NotificationBroadcastStatus.PARTIAL;
    }
  } catch (err) {
    status = NotificationBroadcastStatus.FAILED;
    error = err instanceof Error ? err.message : String(err);
  }

  const row = await prisma.notificationBroadcast.update({
    where: { id: broadcastId },
    data: { ...counts, status, error, completedAt: new Date() },
    include: BROADCAST_INCLUDE,
  });
  return toBroadcastDto(row);
}
