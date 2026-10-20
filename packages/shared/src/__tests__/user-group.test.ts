import { describe, expect, it } from 'vitest';

import {
  DynamicGroupRuleSchema,
  DynamicGroupRulesSchema,
  GroupRulesPreviewInputSchema,
  MotherPickerQuerySchema,
  UserGroupInputSchema,
  UserGroupMembersSchema,
  UserGroupUpdateSchema,
  describeDynamicRule,
  describeDynamicRules,
  type DynamicGroupRule,
} from '../user-group';
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, ADMIN_SECTION_PATHS, OperatorPermissionsSchema } from '../operator';
import { NotificationTypeSchema, NotificationReferenceTypeSchema } from '../notifications';
import { AdminMotherListQuerySchema } from '../admin';

describe('UserGroupInputSchema', () => {
  it('trims the name, stores a blank description as null, and defaults to a static group', () => {
    expect(UserGroupInputSchema.parse({ name: '  Beta  ', description: ' ' })).toEqual({
      name: 'Beta',
      description: null,
      kind: 'STATIC',
      rules: null,
    });
  });
  it('refuses an empty name', () => {
    expect(UserGroupInputSchema.safeParse({ name: '  ' }).success).toBe(false);
  });
  it('refuses rules on a static group', () => {
    const res = UserGroupInputSchema.safeParse({ name: 'G', kind: 'STATIC', rules: [] });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]).toMatchObject({ path: ['rules'], message: 'Only dynamic groups have rules.' });
  });
  it('needs a rules array on a dynamic group; an empty one is every active mother', () => {
    expect(UserGroupInputSchema.safeParse({ name: 'G', kind: 'DYNAMIC' }).success).toBe(false);
    expect(UserGroupInputSchema.parse({ name: 'All mothers', kind: 'DYNAMIC', rules: [] })).toMatchObject({ kind: 'DYNAMIC', rules: [] });
    expect(
      UserGroupInputSchema.parse({ name: 'Lapsed', kind: 'DYNAMIC', rules: [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }] }).rules,
    ).toEqual([{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }]);
  });
});

describe('UserGroupUpdateSchema', () => {
  it('drops kind — it is fixed after creation', () => {
    expect(UserGroupUpdateSchema.parse({ name: 'G', kind: 'DYNAMIC' })).toEqual({ name: 'G', description: null });
  });
  it('accepts a rules edit', () => {
    expect(UserGroupUpdateSchema.parse({ name: 'G', rules: [{ field: 'totalSpent', op: 'gte', value: 1000 }] }).rules).toHaveLength(1);
  });
});

describe('UserGroupMembersSchema', () => {
  it('needs at least one user id', () => {
    expect(UserGroupMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
  });
});

describe('DynamicGroupRuleSchema', () => {
  it('takes days 1–3650 on the date fields', () => {
    expect(DynamicGroupRuleSchema.safeParse({ field: 'lastLoginAt', op: 'withinDays', days: 1 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'lastLoginAt', op: 'withinDays', days: 3650 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'lastLoginAt', op: 'withinDays', days: 0 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'createdAt', op: 'withinDays', days: 3651 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'createdAt', op: 'gte', days: 3 }).success).toBe(false);
  });
  it('takes gte/lte with a value ≥ 0 on the number fields, whole bookings only', () => {
    expect(DynamicGroupRuleSchema.safeParse({ field: 'completedBookings', op: 'gte', value: 0 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'completedBookings', op: 'gte', value: 1.5 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'totalSpent', op: 'lte', value: 499.5 }).success).toBe(true);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'totalSpent', op: 'lte', value: -1 }).success).toBe(false);
    expect(DynamicGroupRuleSchema.safeParse({ field: 'totalSpent', op: 'withinDays', days: 3 }).success).toBe(false);
  });
  it('refuses an unknown field', () => {
    expect(DynamicGroupRuleSchema.safeParse({ field: 'age', op: 'gte', value: 3 }).success).toBe(false);
  });
});

describe('DynamicGroupRulesSchema', () => {
  it('allows each field once', () => {
    const res = DynamicGroupRulesSchema.safeParse([
      { field: 'lastAppOpenAt', op: 'withinDays', days: 7 },
      { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
    ]);
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe('Each rule field can be used once.');
  });
  it('allows an empty list', () => {
    expect(DynamicGroupRulesSchema.parse([])).toEqual([]);
  });
});

describe('describeDynamicRule(s)', () => {
  const cases: [DynamicGroupRule, string][] = [
    [{ field: 'lastAppOpenAt', op: 'withinDays', days: 7 }, 'Opened the app in the last 7 days'],
    [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }, 'Not opened the app in 30+ days (or never)'],
    [{ field: 'lastLoginAt', op: 'withinDays', days: 14 }, 'Signed in within 14 days'],
    [{ field: 'lastLoginAt', op: 'notWithinDays', days: 60 }, 'Not signed in for 60+ days (or never)'],
    [{ field: 'createdAt', op: 'withinDays', days: 7 }, 'Signed up in the last 7 days'],
    [{ field: 'createdAt', op: 'notWithinDays', days: 90 }, 'Signed up 90+ days ago'],
    [{ field: 'lastBookingAt', op: 'withinDays', days: 30 }, 'Booked in the last 30 days'],
    [{ field: 'lastBookingAt', op: 'notWithinDays', days: 60 }, 'No booking in 60+ days (or never)'],
    [{ field: 'completedBookings', op: 'gte', value: 3 }, 'At least 3 completed bookings'],
    [{ field: 'completedBookings', op: 'lte', value: 0 }, 'At most 0 completed bookings'],
    [{ field: 'totalSpent', op: 'gte', value: 1000 }, 'Spent at least EGP 1,000'],
    [{ field: 'totalSpent', op: 'lte', value: 500 }, 'Spent at most EGP 500'],
  ];
  it.each(cases)('describes %j', (rule, text) => {
    expect(describeDynamicRule(rule)).toBe(text);
  });
  it('joins rules with AND, and reads an empty set as every active mother', () => {
    expect(
      describeDynamicRules([
        { field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 },
        { field: 'completedBookings', op: 'gte', value: 1 },
      ]),
    ).toBe('Not opened the app in 30+ days (or never) AND At least 1 completed booking');
    expect(describeDynamicRules([])).toBe('Every active mother');
  });
});

describe('GroupRulesPreviewInputSchema', () => {
  it('validates the rules it carries', () => {
    expect(GroupRulesPreviewInputSchema.safeParse({ rules: [{ field: 'nope' }] }).success).toBe(false);
    expect(GroupRulesPreviewInputSchema.parse({ rules: [] })).toEqual({ rules: [] });
  });
});

describe('MotherPickerQuerySchema', () => {
  it('defaults to newest sign-ups first and falls back on an unknown sort key', () => {
    expect(MotherPickerQuerySchema.parse({})).toMatchObject({ page: 1, sortBy: 'createdAt', sortDir: 'desc' });
    expect(MotherPickerQuerySchema.parse({ sortBy: 'nope', groupId: '4' })).toMatchObject({ sortBy: 'createdAt', groupId: 4 });
    expect(MotherPickerQuerySchema.parse({ excludeGroupId: '7' })).toMatchObject({ excludeGroupId: 7 });
  });
  it('sorts by last app open', () => {
    expect(MotherPickerQuerySchema.parse({ sortBy: 'lastAppOpenAt' }).sortBy).toBe('lastAppOpenAt');
  });
  it('parses rules from a JSON string, and refuses bad JSON or bad rules on `rules`', () => {
    const rules = [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }];
    expect(MotherPickerQuerySchema.parse({ rules: JSON.stringify(rules) }).rules).toEqual(rules);
    expect(MotherPickerQuerySchema.parse({}).rules).toBeUndefined();
    const badJson = MotherPickerQuerySchema.safeParse({ rules: '[{' });
    expect(badJson.success).toBe(false);
    expect(badJson.error?.issues[0]?.path).toEqual(['rules']);
    const badRule = MotherPickerQuerySchema.safeParse({ rules: JSON.stringify([{ field: 'age' }]) });
    expect(badRule.success).toBe(false);
    expect(badRule.error?.issues[0]?.path).toEqual(['rules']);
  });
});

describe('AdminMotherListQuerySchema', () => {
  it('filters by last app open and sorts by it, falling back on unknown values', () => {
    expect(AdminMotherListQuerySchema.parse({})).toMatchObject({ lastAppOpen: 'ANY', sortBy: 'registered' });
    expect(AdminMotherListQuerySchema.parse({ lastAppOpen: 'NOT_30', sortBy: 'lastAppOpenAt' })).toMatchObject({
      lastAppOpen: 'NOT_30',
      sortBy: 'lastAppOpenAt',
    });
    expect(AdminMotherListQuerySchema.parse({ lastAppOpen: 'SOMETIMES' }).lastAppOpen).toBe('ANY');
  });
});

describe('admin sections, survey notification type', () => {
  it('are console sections with a label and a path', () => {
    expect(ADMIN_SECTIONS).toEqual(expect.arrayContaining(['surveys', 'groups', 'notifications']));
    expect(ADMIN_SECTION_LABELS.surveys).toBe('Surveys');
    expect(ADMIN_SECTION_PATHS.surveys).toBe('/surveys');
    expect(ADMIN_SECTION_LABELS.groups).toBe('Groups');
    expect(ADMIN_SECTION_PATHS.groups).toBe('/groups');
    expect(ADMIN_SECTION_LABELS.notifications).toBe('Notifications');
    expect(ADMIN_SECTION_PATHS.notifications).toBe('/notifications');
    expect(OperatorPermissionsSchema.parse({ notifications: 'MANAGE' })).toEqual({ notifications: 'MANAGE' });
  });
  it('is a notification type and a reference type', () => {
    expect(NotificationTypeSchema.parse('survey')).toBe('survey');
    expect(NotificationReferenceTypeSchema.parse('survey')).toBe('survey');
  });
});
