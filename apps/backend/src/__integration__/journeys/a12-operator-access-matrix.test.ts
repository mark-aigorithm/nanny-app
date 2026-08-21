/**
 * A12 — the operator access matrix, over real HTTP.
 *
 * The console's sidebar and the API both decide reach with `hasSectionAccess`,
 * so a drift between them is silent — an operator sees a page whose writes
 * fail, or worse, reaches a route the UI meant to hide. This walks the live
 * `ADMIN_ROUTE_PERMISSIONS` table and asserts the gate's real answer for every
 * declared route at every access level.
 *
 * The table drives the test rather than a fixture list, so a route added
 * without a matching expectation cannot slip through: it is exercised the
 * moment it is declared.
 *
 * "Allowed" is asserted as **not 403**, never as 200. The gate runs before
 * validation, so a permitted request with a placeholder body legitimately ends
 * in 400 or 404 — what matters is that it got past the privilege check.
 */
import { ADMIN_SECTIONS, type OperatorPermissions } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import {
  ADMIN_ROUTE_PERMISSIONS,
  evaluateRequirement,
  type Requirement,
} from '@backend/lib/admin-permissions';

import { authHeader } from '../../../test/auth';
import { makeOperator, makeSuperuser } from '../../../test/factories';

/** Every section at one level — three operators cover the whole matrix. */
function allSectionsAt(level: 'VIEW' | 'MANAGE'): OperatorPermissions {
  return Object.fromEntries(
    ADMIN_SECTIONS.map((name) => [name, level]),
  ) as OperatorPermissions;
}

const LEVELS = {
  /** No grants at all — the deny-by-default baseline. */
  none: {} as OperatorPermissions,
  view: allSectionsAt('VIEW'),
  manage: allSectionsAt('MANAGE'),
};

type LevelName = keyof typeof LEVELS;

/**
 * A concrete path for a pattern. Ids need not exist: the privilege gate runs
 * before the handler, so a 404 from a missing row still proves it passed.
 */
function concretePath(pattern: string): string {
  return `/admin${pattern.replace(/:[A-Za-z]+/g, '1')}`;
}

/** `PUT /config` is gated by body key, so it needs a body to be judged at all. */
function bodyFor(pattern: string, method: string): object {
  if (method === 'PUT' && pattern === '/config') {
    return { standardHourlyRate: 130 };
  }
  return {};
}

describe('A12 — operator access matrix', () => {
  it('declares a privilege for every admin route', () => {
    // Guards the guard: an empty or half-populated table would make every
    // assertion below vacuously true.
    expect(ADMIN_ROUTE_PERMISSIONS.length).toBeGreaterThan(50);
  });

  describe.each(Object.keys(LEVELS) as LevelName[])('operator with %s access', (levelName) => {
    const permissions = LEVELS[levelName];

    it('is refused exactly the routes the permission table refuses', async () => {
      const operator = await makeOperator(permissions);

      const mismatches: string[] = [];

      for (const rule of ADMIN_ROUTE_PERMISSIONS) {
        const body = bodyFor(rule.pattern, rule.method);
        const expected = evaluateRequirement(
          rule.requires as Requirement,
          { role: 'OPERATOR', permissions },
          body,
        );

        const method = rule.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
        const response = await request(app)[method](concretePath(rule.pattern))
          .set(...authHeader(operator.token))
          .send(body);

        const wasRefused = response.status === 403;
        if (wasRefused === expected.allowed) {
          mismatches.push(
            `${rule.method} ${rule.pattern} → HTTP ${response.status}, ` +
              `but the table says ${expected.allowed ? 'allowed' : 'denied'}`,
          );
        }
      }

      // Reported together: one failing route should not hide the other 60.
      expect(mismatches).toEqual([]);
    }, 120_000);
  });

  it('refuses superuser-only routes to an operator holding every section', async () => {
    const operator = await makeOperator(LEVELS.manage);

    // Managing who exists, and what they may touch, is root-only — no amount of
    // section access substitutes for it.
    const response = await request(app)
      .get('/admin/admins')
      .set(...authHeader(operator.token));

    expect(response.status).toBe(403);
  });

  it('lets a superuser through the same route', async () => {
    const superuser = await makeSuperuser();

    const response = await request(app)
      .get('/admin/admins')
      .set(...authHeader(superuser.token));

    expect(response.status).toBe(200);
  });

  it('gates PUT /config by which keys the body writes', async () => {
    // Pricing-only reach: a pricing key is fine, a booking-options key is not,
    // and mixing them in one request must not smuggle the second past the gate.
    const pricingOperator = await makeOperator({ pricing: 'MANAGE' });
    const header = authHeader(pricingOperator.token);

    const pricingOnly = await request(app)
      .put('/admin/config')
      .set(...header)
      .send({ standardHourlyRate: 130 });
    expect(pricingOnly.status).not.toBe(403);

    const settingsOnly = await request(app)
      .put('/admin/config')
      .set(...header)
      .send({ maxBookingHours: 10 });
    expect(settingsOnly.status).toBe(403);

    const mixed = await request(app)
      .put('/admin/config')
      .set(...header)
      .send({ standardHourlyRate: 130, maxBookingHours: 10 });
    expect(mixed.status).toBe(403);
  });

  it('refuses an operator whose stored permissions are malformed', async () => {
    // `admin_permissions` is a free-form JSON column; a hand-edited value must
    // degrade to no access rather than to something unpredictable.
    const operator = await makeOperator(
      { bookings: 'MANAGE' },
      { adminPermissions: { bookings: 'GOD_MODE' } },
    );

    const response = await request(app)
      .get('/admin/bookings')
      .set(...authHeader(operator.token));

    expect(response.status).toBe(403);
  });

  it('still refuses a section an operator was never granted', async () => {
    const operator = await makeOperator({ bookings: 'MANAGE' });
    const header = authHeader(operator.token);

    expect((await request(app).get('/admin/bookings').set(...header)).status).not.toBe(403);
    expect((await request(app).get('/admin/promo-codes').set(...header)).status).toBe(403);
  });

  it('refuses a MANAGE route to a VIEW-only operator on that section', async () => {
    const operator = await makeOperator({ bookings: 'VIEW' });
    const header = authHeader(operator.token);

    // Reading the list is fine; approving is not.
    expect((await request(app).get('/admin/bookings').set(...header)).status).not.toBe(403);
    expect(
      (await request(app).post('/admin/bookings/1/approve').set(...header)).status,
    ).toBe(403);
  });
});
