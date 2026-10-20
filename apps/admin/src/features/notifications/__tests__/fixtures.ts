/**
 * One backend for the notification editor tests (Tasks 10 and 11). The
 * handlers cover every request the editor makes on its own — groups, packages,
 * promo codes, the live count and the send history — so a test only adds the
 * request it is about.
 */
import type {
  AdminUser,
  NotificationBroadcast,
  NotificationTemplate,
  Package,
  PromoCode,
  UserGroup,
} from '@nanny-app/shared';
import { http, HttpResponse } from 'msw';

export function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

export const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
/** Sees notifications, changes nothing. */
export const VIEWER: AdminUser = { ...ADMIN, id: 2, role: 'OPERATOR', permissions: { notifications: 'VIEW' } };
/** Writes notifications, but has no Groups section. */
export const NOTIFIER: AdminUser = { ...ADMIN, id: 3, role: 'OPERATOR', permissions: { notifications: 'MANAGE' } };

export const LAPSED: UserGroup = {
  id: 2, name: 'Lapsed 30d', description: null, kind: 'DYNAMIC',
  rules: [{ field: 'lastAppOpenAt', op: 'notWithinDays', days: 30 }],
  memberCount: 1240, createdAt: '2026-10-01T00:00:00.000Z',
};
export const BETA: UserGroup = {
  id: 9, name: 'Beta testers', description: null, kind: 'STATIC', rules: null,
  memberCount: 12, createdAt: '2026-10-01T00:00:00.000Z',
};

export const PACKAGE: Package = {
  id: 3, name: '10 hours', description: null, hours: 10, price: 1500, validityDays: 30,
  maxSkills: 0, isActive: true, expiresAt: null, createdAt: '2026-09-01T00:00:00.000Z',
};
export const PROMO: PromoCode = {
  id: 7, code: 'SAVE20', discountType: 'PERCENTAGE', value: 20, maxUsage: null,
  maxUsagePerUser: null, usageCount: 0, expiresAt: null, isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

export const TEMPLATE: NotificationTemplate = {
  id: 4, name: 'Win-back 30d', title: 'We miss you', body: 'Book this week and save 20%.',
  imageUrl: null, channel: 'BOTH', targetType: 'PROMO_CODE', packageId: null, promoCodeId: 7,
  package: null, promoCode: { id: 7, code: 'SAVE20' },
  audience: { type: 'GROUPS', groupIds: [2] },
  audienceGroups: [{ id: 2, name: 'Lapsed 30d', kind: 'DYNAMIC' }],
  audienceMothers: [], publishCount: 0, lastPublishedAt: null,
  createdAt: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z',
};

export const BROADCAST: NotificationBroadcast = {
  id: 31, templateId: 4, status: 'SENT', title: 'We miss you', channel: 'BOTH',
  targeted: 1240, inAppCreated: 1240, pushSent: 1031, pushFailed: 0, noDevice: 209,
  skippedGroupIds: [], error: null, publishedBy: { id: 1, name: 'Ops Admin' },
  createdAt: '2026-10-20T09:00:00.000Z', completedAt: '2026-10-20T09:00:04.000Z',
};

export const editorHandlers = [
  http.get('/api/admin/groups', () => ok([LAPSED, BETA])),
  http.get('/api/admin/packages', () => ok([PACKAGE])),
  http.get('/api/admin/promo-codes', () => ok([PROMO])),
  http.post('/api/admin/notification-templates/audience-preview', () =>
    ok({ mothers: 1240, withPushDevice: 1031 }),
  ),
  http.get('/api/admin/notification-templates/:id/broadcasts', () => ok([])),
];
