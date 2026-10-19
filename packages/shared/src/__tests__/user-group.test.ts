import { describe, expect, it } from 'vitest';

import { MotherPickerQuerySchema, UserGroupInputSchema, UserGroupMembersSchema } from '../user-group';
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, ADMIN_SECTION_PATHS } from '../operator';
import { NotificationTypeSchema, NotificationReferenceTypeSchema } from '../notifications';

describe('UserGroupInputSchema', () => {
  it('trims the name and stores a blank description as null', () => {
    expect(UserGroupInputSchema.parse({ name: '  Beta  ', description: ' ' })).toEqual({ name: 'Beta', description: null });
  });
  it('refuses an empty name', () => {
    expect(UserGroupInputSchema.safeParse({ name: '  ' }).success).toBe(false);
  });
});

describe('UserGroupMembersSchema', () => {
  it('needs at least one user id', () => {
    expect(UserGroupMembersSchema.safeParse({ userIds: [] }).success).toBe(false);
  });
});

describe('MotherPickerQuerySchema', () => {
  it('defaults to newest sign-ups first and falls back on an unknown sort key', () => {
    expect(MotherPickerQuerySchema.parse({})).toMatchObject({ page: 1, sortBy: 'createdAt', sortDir: 'desc' });
    expect(MotherPickerQuerySchema.parse({ sortBy: 'nope', groupId: '4' })).toMatchObject({ sortBy: 'createdAt', groupId: 4 });
  });
});

describe('surveys and groups sections, survey notification type', () => {
  it('are console sections with a label and a path', () => {
    expect(ADMIN_SECTIONS).toEqual(expect.arrayContaining(['surveys', 'groups']));
    expect(ADMIN_SECTION_LABELS.surveys).toBe('Surveys');
    expect(ADMIN_SECTION_PATHS.surveys).toBe('/surveys');
    expect(ADMIN_SECTION_LABELS.groups).toBe('Groups');
    expect(ADMIN_SECTION_PATHS.groups).toBe('/groups');
  });
  it('is a notification type and a reference type', () => {
    expect(NotificationTypeSchema.parse('survey')).toBe('survey');
    expect(NotificationReferenceTypeSchema.parse('survey')).toBe('survey');
  });
});
