// The route table pulls in the admin router, which imports every admin service.
// Mock the infrastructure those services touch so this stays a pure unit test.
jest.mock('@backend/db/prisma', () => ({ prisma: {} }));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { createUser: jest.fn(), updateUser: jest.fn(), verifyIdToken: jest.fn() },
}));
jest.mock('@backend/lib/storage', () => ({
  deleteStorageObjectByUrl: jest.fn(),
  uploadObject: jest.fn(),
}));

import type { AdminRole, OperatorPermissions } from '@nanny-app/shared';

import {
  ADMIN_ROUTE_PERMISSIONS,
  configBodySections,
  effectivePermissions,
  evaluateRequirement,
  parseOperatorPermissions,
  resolveRequirement,
} from '@backend/lib/admin-permissions';
import { adminRouter } from '@backend/routes/admin.routes';

/** Express doesn't publish a type for its router stack, so describe what we read. */
type RouteLayer = { route?: { path: string; methods: Record<string, boolean> } };

const routerStack = adminRouter.stack as unknown as RouteLayer[];

/** Every `METHOD /path` the admin router actually serves. */
function liveRoutes(): string[] {
  const keys: string[] = [];
  for (const layer of routerStack) {
    const route = layer.route;
    if (!route) continue;
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (enabled && method !== '_all') keys.push(`${method.toUpperCase()} ${route.path}`);
    }
  }
  return keys;
}

function identity(role: AdminRole, permissions: OperatorPermissions = {}) {
  return { role, permissions };
}

function allows(
  method: string,
  path: string,
  role: AdminRole,
  permissions: OperatorPermissions = {},
  body: unknown = {},
): boolean {
  const requirement = resolveRequirement(method, path);
  if (!requirement) return false;
  return evaluateRequirement(requirement, identity(role, permissions), body).allowed;
}

describe('admin route → privilege table', () => {
  /**
   * The guard that matters most: the table must cover the router exactly. A new
   * admin endpoint added without a declared privilege fails here rather than
   * shipping wide open (the middleware refuses it, so it would be dead anyway).
   */
  it('declares a privilege for every route on the admin router', () => {
    const routes = liveRoutes();
    expect(routes.length).toBeGreaterThan(50); // sanity: the stack really was read

    const undeclared = routes.filter((key) => {
      const [method, path] = key.split(' ');
      return !resolveRequirement(method ?? '', path ?? '');
    });

    expect(undeclared).toEqual([]);
  });

  it('has no entry pointing at a route the router does not serve', () => {
    const live = new Set(liveRoutes());
    const stale = ADMIN_ROUTE_PERMISSIONS.map((rule) => `${rule.method} ${rule.pattern}`).filter(
      (key) => !live.has(key),
    );

    expect(stale).toEqual([]);
  });

  it('refuses a path that is not in the table', () => {
    expect(resolveRequirement('GET', '/not-a-real-endpoint')).toBeNull();
    expect(allows('GET', '/not-a-real-endpoint', 'OPERATOR', { bookings: 'MANAGE' })).toBe(false);
  });

  it('matches :param segments but not extra ones', () => {
    expect(resolveRequirement('POST', '/bookings/42/refund')).not.toBeNull();
    expect(resolveRequirement('POST', '/bookings/42/refund/extra')).toBeNull();
  });
});

describe('privilege evaluation', () => {
  it('lets ADMIN and SUPERUSER through every section requirement', () => {
    for (const role of ['ADMIN', 'SUPERUSER'] as const) {
      expect(allows('POST', '/bookings/1/refund', role)).toBe(true);
      expect(allows('DELETE', '/promo-codes/1', role)).toBe(true);
      expect(allows('PUT', '/config', role, {}, { standardHourlyRate: 90 })).toBe(true);
    }
  });

  it('reserves the team routes for the superuser', () => {
    expect(allows('GET', '/admins', 'SUPERUSER')).toBe(true);
    expect(allows('GET', '/admins', 'ADMIN')).toBe(false);
    expect(allows('POST', '/admins', 'OPERATOR', { users: 'MANAGE' })).toBe(false);
  });

  it('treats MANAGE as including VIEW, but not the other way round', () => {
    expect(allows('GET', '/bookings', 'OPERATOR', { bookings: 'MANAGE' })).toBe(true);
    expect(allows('GET', '/bookings', 'OPERATOR', { bookings: 'VIEW' })).toBe(true);
    expect(allows('POST', '/bookings/7/approve', 'OPERATOR', { bookings: 'VIEW' })).toBe(false);
    expect(allows('POST', '/bookings/7/approve', 'OPERATOR', { bookings: 'MANAGE' })).toBe(true);
  });

  it('denies a section that is absent or explicitly NONE', () => {
    expect(allows('GET', '/promo-codes', 'OPERATOR', { bookings: 'MANAGE' })).toBe(false);
    expect(allows('GET', '/promo-codes', 'OPERATOR', { promoCodes: 'NONE' })).toBe(false);
  });

  it('keeps sections independent — Marketplace access grants nothing else', () => {
    const perms: OperatorPermissions = { marketplace: 'MANAGE' };
    expect(allows('POST', '/marketplace/listings/3/approve', 'OPERATOR', perms)).toBe(true);
    expect(allows('GET', '/bookings', 'OPERATOR', perms)).toBe(false);
    expect(allows('GET', '/rewards/wallets', 'OPERATOR', perms)).toBe(false);
    expect(allows('PATCH', '/mothers/8', 'OPERATOR', perms)).toBe(false);
  });

  it('accepts any one of the sections on a shared route', () => {
    // The platform config row is read by Bookings, Pricing and Booking Options.
    expect(allows('GET', '/config', 'OPERATOR', { bookings: 'VIEW' })).toBe(true);
    expect(allows('GET', '/config', 'OPERATOR', { pricing: 'VIEW' })).toBe(true);
    expect(allows('GET', '/config', 'OPERATOR', { settings: 'VIEW' })).toBe(true);
    expect(allows('GET', '/config', 'OPERATOR', { cameras: 'MANAGE' })).toBe(false);

    // Skill fees are edited from Pricing & Fees, the skill itself from Skills.
    expect(allows('PATCH', '/skills/2', 'OPERATOR', { pricing: 'MANAGE' })).toBe(true);
    expect(allows('PATCH', '/skills/2', 'OPERATOR', { skills: 'MANAGE' })).toBe(true);
    expect(allows('DELETE', '/skills/2', 'OPERATOR', { pricing: 'MANAGE' })).toBe(false);
  });

  it('lets any console account read the shared catalogs and its own profile', () => {
    const none: OperatorPermissions = {};
    expect(allows('GET', '/me', 'OPERATOR', none)).toBe(true);
    expect(allows('GET', '/skills', 'OPERATOR', none)).toBe(true);
    expect(allows('GET', '/certifications', 'OPERATOR', none)).toBe(true);
  });

  it('treats the pricing calculator as a read', () => {
    expect(allows('POST', '/pricing/calculate', 'OPERATOR', { pricing: 'VIEW' })).toBe(true);
    expect(allows('POST', '/duration-rules', 'OPERATOR', { pricing: 'VIEW' })).toBe(false);
  });

  it('explains the refusal in terms of the section', () => {
    const requirement = resolveRequirement('DELETE', '/promo-codes/1');
    expect(requirement).not.toBeNull();
    const decision = evaluateRequirement(requirement!, identity('OPERATOR', {}), {});
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toContain('Promo Codes');
      expect(decision.reason).toContain('manage');
    }
  });
});

describe('PUT /config field scoping', () => {
  // One endpoint, two owners: rates belong to Pricing & Fees, everything else to
  // Booking Options. The privilege has to follow the keys, not the URL.
  const pricingBody = { standardHourlyRate: 120, nannyPercent: 80, platformPercent: 20 };
  const bookingOptionsBody = { broadcastRadiusKm: 15, minBookingHours: 2 };
  const mixedBody = { ...pricingBody, ...bookingOptionsBody };

  it('maps a body to the sections it actually writes', () => {
    expect(configBodySections(pricingBody)).toEqual(['pricing']);
    expect(configBodySections(bookingOptionsBody)).toEqual(['settings']);
    expect(configBodySections(mixedBody).sort()).toEqual(['pricing', 'settings']);
  });

  it('lets a pricing operator write rates but not booking options', () => {
    const perms: OperatorPermissions = { pricing: 'MANAGE' };
    expect(allows('PUT', '/config', 'OPERATOR', perms, pricingBody)).toBe(true);
    expect(allows('PUT', '/config', 'OPERATOR', perms, bookingOptionsBody)).toBe(false);
    expect(allows('PUT', '/config', 'OPERATOR', perms, mixedBody)).toBe(false);
  });

  it('lets a booking-options operator write limits but not rates', () => {
    const perms: OperatorPermissions = { settings: 'MANAGE' };
    expect(allows('PUT', '/config', 'OPERATOR', perms, bookingOptionsBody)).toBe(true);
    expect(allows('PUT', '/config', 'OPERATOR', perms, pricingBody)).toBe(false);
  });

  it('requires both when the body straddles the two', () => {
    const perms: OperatorPermissions = { pricing: 'MANAGE', settings: 'MANAGE' };
    expect(allows('PUT', '/config', 'OPERATOR', perms, mixedBody)).toBe(true);
  });

  it('needs MANAGE, not VIEW', () => {
    expect(allows('PUT', '/config', 'OPERATOR', { pricing: 'VIEW' }, pricingBody)).toBe(false);
  });

  it('ignores keys that are not settings — Zod rejects those moments later', () => {
    expect(configBodySections({ notASetting: 1 })).toEqual([]);
    expect(configBodySections(null)).toEqual([]);
    expect(configBodySections('nope')).toEqual([]);
  });
});

describe('stored permissions', () => {
  it('degrades a malformed column to no access rather than something unpredictable', () => {
    expect(parseOperatorPermissions(null)).toEqual({});
    expect(parseOperatorPermissions('bookings')).toEqual({});
    expect(parseOperatorPermissions({ bookings: 'SUPERPOWERS' })).toEqual({});
  });

  it('keeps the sections it recognises and drops the rest', () => {
    expect(parseOperatorPermissions({ bookings: 'VIEW', nonsense: 'MANAGE' })).toEqual({
      bookings: 'VIEW',
    });
  });

  it('gives ADMIN and SUPERUSER the full map regardless of what is stored', () => {
    expect(effectivePermissions('ADMIN', null).bookings).toBe('MANAGE');
    expect(effectivePermissions('SUPERUSER', { bookings: 'VIEW' }).pricing).toBe('MANAGE');
    expect(effectivePermissions('OPERATOR', { bookings: 'VIEW' })).toEqual({ bookings: 'VIEW' });
  });
});
