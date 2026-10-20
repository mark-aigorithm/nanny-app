import { z } from 'zod';

import { AdminListQuerySchema, AdminSortDirSchema } from './admin';

// ──────────────────────────────────────────────────────────────
// Admin-curated groups of mothers, and the sortable mother picker used to
// fill groups and pick individuals. Feature-neutral on purpose: Surveys and
// the notification center both send to groups — keep survey- and
// notification-specific types out of this file.
//
// A group is STATIC (hand-picked members) or DYNAMIC (rules evaluated when
// something is sent; no member rows). The kind is fixed at creation.
// ──────────────────────────────────────────────────────────────

export const USER_GROUP_NAME_MAX = 80;
export const USER_GROUP_DESCRIPTION_MAX = 300;

export const UserGroupKindSchema = z.enum(['STATIC', 'DYNAMIC']);
export type UserGroupKind = z.infer<typeof UserGroupKindSchema>;

// ── Dynamic-group rules ───────────────────────────────────────
// AND-ed, each field at most once. `notWithinDays` also matches a NULL
// timestamp ("never"). Booking metrics count COMPLETED, non-deleted bookings
// only — the same aggregate the mother picker shows.

export const DYNAMIC_RULE_DATE_FIELDS = ['lastAppOpenAt', 'lastLoginAt', 'createdAt', 'lastBookingAt'] as const;
export const DYNAMIC_RULE_NUMBER_FIELDS = ['completedBookings', 'totalSpent'] as const;
export const DYNAMIC_RULE_DAYS_MAX = 3650;
export const DYNAMIC_RULES_MAX = DYNAMIC_RULE_DATE_FIELDS.length + DYNAMIC_RULE_NUMBER_FIELDS.length;

export const DynamicDateRuleOpSchema = z.enum(['withinDays', 'notWithinDays']);
export const DynamicNumberRuleOpSchema = z.enum(['gte', 'lte']);

const DynamicDateRuleSchema = z.object({
  field: z.enum(DYNAMIC_RULE_DATE_FIELDS),
  op: DynamicDateRuleOpSchema,
  days: z.number().int().min(1).max(DYNAMIC_RULE_DAYS_MAX),
});

const CompletedBookingsRuleSchema = z.object({
  field: z.literal('completedBookings'),
  op: DynamicNumberRuleOpSchema,
  value: z.number().int().min(0),
});

const TotalSpentRuleSchema = z.object({
  field: z.literal('totalSpent'),
  op: DynamicNumberRuleOpSchema,
  value: z.number().finite().min(0),
});

export const DynamicGroupRuleSchema = z.discriminatedUnion('field', [
  DynamicDateRuleSchema,
  CompletedBookingsRuleSchema,
  TotalSpentRuleSchema,
]);
export type DynamicGroupRule = z.infer<typeof DynamicGroupRuleSchema>;
export type DynamicGroupRuleField = DynamicGroupRule['field'];

export const DynamicGroupRulesSchema = z
  .array(DynamicGroupRuleSchema)
  .max(DYNAMIC_RULES_MAX)
  .superRefine((rules, ctx) => {
    const seen = new Set<DynamicGroupRuleField>();
    rules.forEach((rule, index) => {
      if (seen.has(rule.field)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Each rule field can be used once.', path: [index, 'field'] });
      }
      seen.add(rule.field);
    });
  });
export type DynamicGroupRules = z.infer<typeof DynamicGroupRulesSchema>;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** One rule in plain words, for the rule editor summary and the groups list. */
export function describeDynamicRule(rule: DynamicGroupRule): string {
  switch (rule.field) {
    case 'lastAppOpenAt':
      return rule.op === 'withinDays'
        ? `Opened the app in the last ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `Not opened the app in ${rule.days}+ ${plural(rule.days, 'day', 'days')} (or never)`;
    case 'lastLoginAt':
      return rule.op === 'withinDays'
        ? `Signed in within ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `Not signed in for ${rule.days}+ ${plural(rule.days, 'day', 'days')} (or never)`;
    case 'createdAt':
      return rule.op === 'withinDays'
        ? `Signed up in the last ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `Signed up ${rule.days}+ ${plural(rule.days, 'day', 'days')} ago`;
    case 'lastBookingAt':
      return rule.op === 'withinDays'
        ? `Booked in the last ${rule.days} ${plural(rule.days, 'day', 'days')}`
        : `No booking in ${rule.days}+ ${plural(rule.days, 'day', 'days')} (or never)`;
    case 'completedBookings':
      return `${rule.op === 'gte' ? 'At least' : 'At most'} ${rule.value} completed ${plural(rule.value, 'booking', 'bookings')}`;
    case 'totalSpent':
      return `Spent ${rule.op === 'gte' ? 'at least' : 'at most'} EGP ${rule.value.toLocaleString('en-US')}`;
  }
}

/** The whole rule set; no rules means the group is every active mother. */
export function describeDynamicRules(rules: DynamicGroupRules): string {
  if (rules.length === 0) return 'Every active mother';
  return rules.map(describeDynamicRule).join(' AND ');
}

// ── Groups ────────────────────────────────────────────────────

const groupName = z.string().trim().min(1).max(USER_GROUP_NAME_MAX);
const groupDescription = z
  .string()
  .trim()
  .max(USER_GROUP_DESCRIPTION_MAX)
  .nullish()
  .transform((v) => (v ? v : null));

/**
 * Create body (POST /admin/groups). STATIC groups carry no rules (normalised to
 * null); DYNAMIC groups must send a rules array — an empty one means every
 * active mother.
 */
export const UserGroupInputSchema = z
  .object({
    name: groupName,
    description: groupDescription,
    kind: UserGroupKindSchema.default('STATIC'),
    rules: DynamicGroupRulesSchema.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'STATIC' && v.rules != null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only dynamic groups have rules.', path: ['rules'] });
    }
    if (v.kind === 'DYNAMIC' && v.rules == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A dynamic group needs its rules.', path: ['rules'] });
    }
  })
  .transform((v) => ({
    name: v.name,
    description: v.description,
    kind: v.kind,
    rules: v.kind === 'DYNAMIC' ? (v.rules ?? []) : null,
  }));
export type UserGroupInput = z.input<typeof UserGroupInputSchema>;
export type UserGroupValues = z.output<typeof UserGroupInputSchema>;

/** Edit body (PATCH /admin/groups/:id). `kind` is fixed after creation, so it is not accepted. */
export const UserGroupUpdateSchema = z.object({
  name: groupName,
  description: groupDescription,
  /** DYNAMIC only — the service refuses rules on a STATIC group. */
  rules: DynamicGroupRulesSchema.optional(),
});
export type UserGroupUpdateInput = z.input<typeof UserGroupUpdateSchema>;

export const UserGroupSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  kind: UserGroupKindSchema,
  /** DYNAMIC only; null for STATIC. */
  rules: DynamicGroupRulesSchema.nullable(),
  /** STATIC: live member rows. DYNAMIC: mothers matching the rules right now. */
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type UserGroup = z.infer<typeof UserGroupSchema>;

export const UserGroupMembersSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(1000),
});
export type UserGroupMembersInput = z.infer<typeof UserGroupMembersSchema>;

/** POST /admin/groups/rules-preview — how many mothers a rule set matches now. */
export const GroupRulesPreviewInputSchema = z.object({ rules: DynamicGroupRulesSchema });
export type GroupRulesPreviewInput = z.infer<typeof GroupRulesPreviewInputSchema>;

export const GroupRulesPreviewSchema = z.object({ count: z.number().int() });
export type GroupRulesPreview = z.infer<typeof GroupRulesPreviewSchema>;

// ── Mother picker ─────────────────────────────────────────────

/** Bookings, hours and spend count COMPLETED bookings only. */
export const MOTHER_PICKER_SORT_KEYS = [
  'name',
  'completedBookings',
  'hoursBooked',
  'totalSpent',
  'lastBookingAt',
  'createdAt',
  'lastLoginAt',
  'lastAppOpenAt',
] as const;
export const MotherPickerSortKeySchema = z.enum(MOTHER_PICKER_SORT_KEYS);
export type MotherPickerSortKey = z.infer<typeof MotherPickerSortKeySchema>;

export const MotherPickerQuerySchema = AdminListQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  /** Only this group's members — the group detail page's member table. */
  groupId: z.coerce.number().int().positive().optional(),
  /** Leave out this group's members — the group's own "Add mothers" picker. */
  excludeGroupId: z.coerce.number().int().positive().optional(),
  /**
   * Only mothers matching these dynamic-group rules — a dynamic group's
   * read-only member table. Sent as a JSON string in the query.
   */
  rules: z
    .string()
    .optional()
    .transform((raw, ctx): DynamicGroupRules | undefined => {
      if (raw === undefined || raw.trim() === '') return undefined;
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'rules must be a JSON array.' });
        return z.NEVER;
      }
      const parsed = DynamicGroupRulesSchema.safeParse(json);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error.issues[0]?.message ?? 'Invalid rules.' });
        return z.NEVER;
      }
      return parsed.data;
    }),
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
  lastAppOpenAt: z.string().nullable(),
});
export type MotherPickerRow = z.infer<typeof MotherPickerRowSchema>;
