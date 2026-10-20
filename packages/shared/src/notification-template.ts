import { z } from 'zod';

import { CampaignTargetTypeSchema } from './campaign';
import { UserGroupKindSchema } from './user-group';

// ──────────────────────────────────────────────────────────────
// Notification center — admin-built templates published to mothers on
// demand. Every send comes from a template; each publish snapshots the
// template into a broadcast. See
// docs/superpowers/specs/2026-10-20-admin-notification-center-design.md.
// ──────────────────────────────────────────────────────────────

export const NOTIFICATION_TEMPLATE_NAME_MAX = 80;
export const NOTIFICATION_TITLE_MAX = 65;
export const NOTIFICATION_BODY_MAX = 240;

/** The image is cropped to this 2:1 size (the campaign cropper) and stored in the `notifications` folder. */
export const NOTIFICATION_IMAGE_WIDTH = 1024;
export const NOTIFICATION_IMAGE_HEIGHT = 512;

export const NOTIFICATION_AUDIENCE_MAX_GROUPS = 20;
export const NOTIFICATION_AUDIENCE_MAX_MOTHERS = 5000;

/** A broadcast still SENDING after this long reads as FAILED ("Timed out") and no longer blocks a publish. */
export const BROADCAST_STALE_MS = 5 * 60 * 1000;

export const NotificationChannelSchema = z.enum(['IN_APP', 'PUSH', 'BOTH']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

const dedupe = (ids: number[]): number[] => [...new Set(ids)];

/** Who a template goes to: one or more groups (unioned), or hand-picked mothers. */
export const NotificationAudienceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('GROUPS'),
    groupIds: z.array(z.number().int().positive()).min(1).max(NOTIFICATION_AUDIENCE_MAX_GROUPS).transform(dedupe),
  }),
  z.object({
    type: z.literal('MOTHERS'),
    motherIds: z.array(z.number().int().positive()).min(1).max(NOTIFICATION_AUDIENCE_MAX_MOTHERS).transform(dedupe),
  }),
]);
export type NotificationAudience = z.infer<typeof NotificationAudienceSchema>;

/**
 * Create (POST) and edit (PATCH) body — PATCH is a full replace. The link is
 * none, or exactly one of a package / a promo code, matching `targetType`
 * (the campaigns rule).
 */
export const NotificationTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(NOTIFICATION_TEMPLATE_NAME_MAX),
    title: z.string().trim().min(1).max(NOTIFICATION_TITLE_MAX),
    body: z.string().trim().min(1).max(NOTIFICATION_BODY_MAX),
    imageUrl: z.string().url().nullable().default(null),
    channel: NotificationChannelSchema,
    targetType: CampaignTargetTypeSchema.nullable().default(null),
    packageId: z.number().int().positive().nullable().default(null),
    promoCodeId: z.number().int().positive().nullable().default(null),
    audience: NotificationAudienceSchema,
  })
  .refine(
    (v) => {
      if (v.targetType === 'PACKAGE') return v.packageId != null && v.promoCodeId == null;
      if (v.targetType === 'PROMO_CODE') return v.promoCodeId != null && v.packageId == null;
      return v.packageId == null && v.promoCodeId == null;
    },
    { message: 'Pick exactly one package or promo code for this link.', path: ['targetType'] },
  );
export type NotificationTemplateInput = z.input<typeof NotificationTemplateInputSchema>;
export type NotificationTemplateValues = z.output<typeof NotificationTemplateInputSchema>;

/** Admin DTO for one template, with the link and audience names resolved for display. */
export const NotificationTemplateSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  channel: NotificationChannelSchema,
  targetType: CampaignTargetTypeSchema.nullable(),
  packageId: z.number().int().nullable(),
  promoCodeId: z.number().int().nullable(),
  package: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  promoCode: z.object({ id: z.number().int(), code: z.string() }).nullable(),
  audience: NotificationAudienceSchema,
  audienceGroups: z.array(z.object({ id: z.number().int(), name: z.string(), kind: UserGroupKindSchema })),
  audienceMothers: z.array(z.object({ id: z.number().int(), name: z.string() })),
  publishCount: z.number().int(),
  lastPublishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;

/** One row of the Notifications page table. */
export const NotificationTemplateListItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  title: z.string(),
  channel: NotificationChannelSchema,
  targetType: CampaignTargetTypeSchema.nullable(),
  /** The package name or the promo code; null without a link. */
  linkLabel: z.string().nullable(),
  /** "2 groups" / "1 group" / "37 mothers" / "1 mother". */
  audienceSummary: z.string(),
  publishCount: z.number().int(),
  lastPublishedAt: z.string().nullable(),
  updatedAt: z.string(),
});
export type NotificationTemplateListItem = z.infer<typeof NotificationTemplateListItemSchema>;

export const NotificationAudiencePreviewInputSchema = z.object({ audience: NotificationAudienceSchema });
export type NotificationAudiencePreviewInput = z.input<typeof NotificationAudiencePreviewInputSchema>;

/** Live count for the editor: who would receive it, and how many of them have a push device. */
export const NotificationAudiencePreviewSchema = z.object({
  mothers: z.number().int(),
  withPushDevice: z.number().int(),
});
export type NotificationAudiencePreview = z.infer<typeof NotificationAudiencePreviewSchema>;

export const NotificationBroadcastStatusSchema = z.enum(['SENDING', 'SENT', 'PARTIAL', 'FAILED']);
export type NotificationBroadcastStatus = z.infer<typeof NotificationBroadcastStatusSchema>;

/** One publish of a template, with its delivery counts. */
export const NotificationBroadcastSchema = z.object({
  id: z.number().int(),
  templateId: z.number().int(),
  status: NotificationBroadcastStatusSchema,
  title: z.string(),
  channel: NotificationChannelSchema,
  targeted: z.number().int(),
  inAppCreated: z.number().int(),
  pushSent: z.number().int(),
  pushFailed: z.number().int(),
  noDevice: z.number().int(),
  /** Groups deleted after the template was saved, skipped at publish. */
  skippedGroupIds: z.array(z.number().int()),
  error: z.string().nullable(),
  publishedBy: z.object({ id: z.number().int(), name: z.string() }),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});
export type NotificationBroadcast = z.infer<typeof NotificationBroadcastSchema>;
