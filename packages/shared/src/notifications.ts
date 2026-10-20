import { z } from 'zod';

import { PaginationMetaSchema } from './booking';

export const NotificationTypeSchema = z.enum([
  'marketplace_message',
  'booking_requested',
  'booking_approved',
  'booking_confirmed',
  'booking_cancelled',
  'nanny_checkin',
  'booking_completed',
  'care_log_entry',
  'nanny_approved',
  'nanny_rejected',
  'points_earned',
  'points_granted',
  'points_redeemed',
  'referral_converted',
  'referral_joined',
  'camera_requested',
  'booking_ended_by_parent',
  'booking_extension_requested',
  'booking_extension_accepted',
  'booking_extension_declined',
  'booking_extended',
  'marketplace_listing_approved',
  'marketplace_listing_rejected',
  'booking_message',
  'survey',
  'announcement',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationReferenceTypeSchema = z.enum([
  'conversation',
  'booking',
  'community_post',
  'survey',
]);
export type NotificationReferenceType = z.infer<typeof NotificationReferenceTypeSchema>;

/**
 * Where tapping an announcement takes the mother: buy a package, or book with
 * a promo code applied. Read through the announcement's broadcast.
 */
export const NotificationLinkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('package'), packageId: z.number().int() }),
  z.object({ type: z.literal('promo_code'), code: z.string().min(1) }),
]);
export type NotificationLink = z.infer<typeof NotificationLinkSchema>;

export const NotificationResponseSchema = z.object({
  id: z.number().int(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  referenceId: z.number().int().nullable(),
  referenceType: NotificationReferenceTypeSchema.nullable(),
  createdAt: z.string(),
  /** Announcements only: the broadcast's image. Defaulted so older payloads still parse. */
  imageUrl: z.string().nullable().default(null),
  /** Announcements only: where a tap goes. */
  link: NotificationLinkSchema.nullable().default(null),
});

export type NotificationResponse = z.infer<typeof NotificationResponseSchema>;

export const NotificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((value): boolean | undefined => {
      if (value === true || value === 'true') return true;
      if (value === false || value === 'false') return false;
      return undefined;
    }),
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationListResponseSchema = z.object({
  notifications: z.array(NotificationResponseSchema),
  meta: PaginationMetaSchema,
});

export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

export const UnreadNotificationCountResponseSchema = z.object({
  unreadCount: z.number(),
});

export type UnreadNotificationCountResponse = z.infer<
  typeof UnreadNotificationCountResponseSchema
>;

export const RegisterPushTokenSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(['ios', 'android']),
});

export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenSchema>;

export const RemovePushTokenSchema = z.object({
  token: z.string().trim().min(1),
});

export type RemovePushTokenRequest = z.infer<typeof RemovePushTokenSchema>;
