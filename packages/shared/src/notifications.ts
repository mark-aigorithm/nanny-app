import { z } from 'zod';

import { PaginationMetaSchema } from './booking';

export const NotificationTypeSchema = z.enum([
  'marketplace_message',
  'nanny_checkin',
  'booking_completed',
  'care_log_entry',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationReferenceTypeSchema = z.enum(['conversation', 'booking']);
export type NotificationReferenceType = z.infer<typeof NotificationReferenceTypeSchema>;

export const NotificationResponseSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  referenceId: z.string().nullable(),
  referenceType: NotificationReferenceTypeSchema.nullable(),
  createdAt: z.string(),
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
