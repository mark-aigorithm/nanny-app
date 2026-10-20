import { z } from 'zod';

import { AdminListQuerySchema, AdminSortDirSchema } from './admin';

// ──────────────────────────────────────────────────────────────
// Admin-curated groups of mothers, and the sortable mother picker used to
// fill groups and pick individuals. Feature-neutral on purpose: Surveys send
// to groups today, the notification center will later — keep survey-specific
// types out of this file.
// ──────────────────────────────────────────────────────────────

export const USER_GROUP_NAME_MAX = 80;
export const USER_GROUP_DESCRIPTION_MAX = 300;

export const UserGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(USER_GROUP_NAME_MAX),
  description: z
    .string()
    .trim()
    .max(USER_GROUP_DESCRIPTION_MAX)
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type UserGroupInput = z.input<typeof UserGroupInputSchema>;

export const UserGroupSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type UserGroup = z.infer<typeof UserGroupSchema>;

export const UserGroupMembersSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(1000),
});
export type UserGroupMembersInput = z.infer<typeof UserGroupMembersSchema>;

/** Bookings, hours and spend count COMPLETED bookings only. */
export const MOTHER_PICKER_SORT_KEYS = [
  'name',
  'completedBookings',
  'hoursBooked',
  'totalSpent',
  'lastBookingAt',
  'createdAt',
  'lastLoginAt',
] as const;
export const MotherPickerSortKeySchema = z.enum(MOTHER_PICKER_SORT_KEYS);
export type MotherPickerSortKey = z.infer<typeof MotherPickerSortKeySchema>;

export const MotherPickerQuerySchema = AdminListQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  /** Only this group's members — the group detail page's member table. */
  groupId: z.coerce.number().int().positive().optional(),
  /** Leave out this group's members — the group's own "Add mothers" picker. */
  excludeGroupId: z.coerce.number().int().positive().optional(),
  sortBy: MotherPickerSortKeySchema.catch('createdAt').default('createdAt'),
  sortDir: AdminSortDirSchema.catch('desc').default('desc'),
});
export type MotherPickerQuery = z.infer<typeof MotherPickerQuerySchema>;

export const MotherPickerRowSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  completedBookings: z.number().int(),
  hoursBooked: z.number(),
  totalSpent: z.number(),
  lastBookingAt: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type MotherPickerRow = z.infer<typeof MotherPickerRowSchema>;
