import type {
  AdminRole,
  AdminSection,
  OperatorPermissions,
  PlatformConfig,
  RequiredAccessLevel,
} from '@nanny-app/shared';
import {
  ADMIN_SECTION_LABELS,
  FULL_ADMIN_PERMISSIONS,
  OperatorPermissionsSchema,
  hasSectionAccess,
} from '@nanny-app/shared';

// ──────────────────────────────────────────────────────────────
// Admin route → required privilege
// ──────────────────────────────────────────────────────────────
// Every endpoint on `adminRouter` is declared here once, and the router-level
// `requireSectionAccess` middleware enforces it. The table is deny-by-default:
// a path with no entry is refused, so a newly added admin route is unreachable
// until its privilege is stated. `admin-permissions.test.ts` walks the live
// router and fails the build if anything is missing.
// ──────────────────────────────────────────────────────────────

export type Requirement =
  /** Any signed-in console account, operators included. */
  | { kind: 'ANY_ADMIN' }
  /** Root account only — managing who exists and what they may touch. */
  | { kind: 'SUPERUSER' }
  /** Satisfied by holding *any one* of the listed section/level pairs. */
  | { kind: 'SECTION'; anyOf: readonly (readonly [AdminSection, RequiredAccessLevel])[] }
  /** PUT /config — the required sections depend on which keys are being written. */
  | { kind: 'CONFIG_BODY' };

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type RouteRule = {
  method: Method;
  /** Path relative to the `/admin` mount. `:param` matches exactly one segment. */
  pattern: string;
  requires: Requirement;
};

/** Shorthand for the common "one section, one level" rule. */
function section(name: AdminSection, level: RequiredAccessLevel): Requirement {
  return { kind: 'SECTION', anyOf: [[name, level]] };
}

/** Shorthand for a route legitimately reached from more than one section. */
function anyOf(
  ...pairs: readonly (readonly [AdminSection, RequiredAccessLevel])[]
): Requirement {
  return { kind: 'SECTION', anyOf: pairs };
}

const ANY_ADMIN: Requirement = { kind: 'ANY_ADMIN' };
const SUPERUSER: Requirement = { kind: 'SUPERUSER' };

export const ADMIN_ROUTE_PERMISSIONS: readonly RouteRule[] = [
  // ── Current admin ───────────────────────────────────────────
  // Drives the console's own permission fetch, so it can never be gated.
  { method: 'GET', pattern: '/me', requires: ANY_ADMIN },

  // ── Bookings ────────────────────────────────────────────────
  { method: 'GET', pattern: '/bookings', requires: section('bookings', 'VIEW') },
  { method: 'GET', pattern: '/bookings/:id', requires: section('bookings', 'VIEW') },
  { method: 'POST', pattern: '/bookings/:id/approve', requires: section('bookings', 'MANAGE') },
  { method: 'POST', pattern: '/bookings/:id/reject', requires: section('bookings', 'MANAGE') },
  { method: 'PATCH', pattern: '/bookings/:id/status', requires: section('bookings', 'MANAGE') },
  { method: 'PATCH', pattern: '/bookings/:id/times', requires: section('bookings', 'MANAGE') },
  { method: 'GET', pattern: '/bookings/:id/edit/context', requires: section('bookings', 'VIEW') },
  // A dry run that writes nothing — viewing the editor is enough.
  { method: 'POST', pattern: '/bookings/:id/edit/preview', requires: section('bookings', 'VIEW') },
  { method: 'POST', pattern: '/bookings/:id/edit', requires: section('bookings', 'MANAGE') },
  { method: 'POST', pattern: '/bookings/:id/refund', requires: section('bookings', 'MANAGE') },

  // ── Users (nannies + mothers + the combined KYC queue) ──────
  { method: 'GET', pattern: '/nannies', requires: section('users', 'VIEW') },
  { method: 'GET', pattern: '/nannies/:id', requires: section('users', 'VIEW') },
  { method: 'PATCH', pattern: '/nannies/:id', requires: section('users', 'MANAGE') },
  { method: 'POST', pattern: '/nannies/:id/approve', requires: section('users', 'MANAGE') },
  { method: 'POST', pattern: '/nannies/:id/reject', requires: section('users', 'MANAGE') },
  { method: 'PUT', pattern: '/nannies/:id/skills', requires: section('users', 'MANAGE') },
  { method: 'GET', pattern: '/mothers', requires: section('users', 'VIEW') },
  { method: 'GET', pattern: '/mothers/:id', requires: section('users', 'VIEW') },
  { method: 'PATCH', pattern: '/mothers/:id', requires: section('users', 'MANAGE') },
  { method: 'POST', pattern: '/mothers/:id/approve', requires: section('users', 'MANAGE') },
  { method: 'POST', pattern: '/mothers/:id/reject', requires: section('users', 'MANAGE') },
  { method: 'GET', pattern: '/id-reviews', requires: section('users', 'VIEW') },

  // ── Marketplace moderation ──────────────────────────────────
  { method: 'GET', pattern: '/marketplace/listings', requires: section('marketplace', 'VIEW') },
  { method: 'POST', pattern: '/marketplace/listings', requires: section('marketplace', 'MANAGE') },
  {
    method: 'POST',
    pattern: '/marketplace/listings/:id/approve',
    requires: section('marketplace', 'MANAGE'),
  },
  {
    method: 'POST',
    pattern: '/marketplace/listings/:id/reject',
    requires: section('marketplace', 'MANAGE'),
  },
  { method: 'PATCH', pattern: '/marketplace/listings/:id', requires: section('marketplace', 'MANAGE') },
  { method: 'DELETE', pattern: '/marketplace/listings/:id', requires: section('marketplace', 'MANAGE') },

  // ── Admin & operator accounts (root only) ───────────────────
  { method: 'GET', pattern: '/admins', requires: SUPERUSER },
  { method: 'POST', pattern: '/admins', requires: SUPERUSER },
  { method: 'PATCH', pattern: '/admins/:id', requires: SUPERUSER },
  { method: 'DELETE', pattern: '/admins/:id', requires: SUPERUSER },

  // ── Promo codes ─────────────────────────────────────────────
  { method: 'GET', pattern: '/promo-codes', requires: section('promoCodes', 'VIEW') },
  { method: 'POST', pattern: '/promo-codes', requires: section('promoCodes', 'MANAGE') },
  { method: 'PATCH', pattern: '/promo-codes/:id', requires: section('promoCodes', 'MANAGE') },
  { method: 'DELETE', pattern: '/promo-codes/:id', requires: section('promoCodes', 'MANAGE') },

  // ── Campaigns ───────────────────────────────────────────────
  { method: 'GET', pattern: '/campaigns', requires: section('campaigns', 'VIEW') },
  { method: 'POST', pattern: '/campaigns', requires: section('campaigns', 'MANAGE') },
  { method: 'PATCH', pattern: '/campaigns/:id', requires: section('campaigns', 'MANAGE') },
  { method: 'DELETE', pattern: '/campaigns/:id', requires: section('campaigns', 'MANAGE') },

  // ── Skills ──────────────────────────────────────────────────
  // The catalog itself is read by the Skills page, the Pricing skill-fee panel
  // and the nanny profile editor — and it's already public to the mobile app,
  // so gating the admin copy would buy nothing.
  { method: 'GET', pattern: '/skills', requires: ANY_ADMIN },
  { method: 'POST', pattern: '/skills', requires: section('skills', 'MANAGE') },
  // Per-skill fees are edited from Pricing & Fees, the skill itself from Skills.
  { method: 'PATCH', pattern: '/skills/:id', requires: anyOf(['skills', 'MANAGE'], ['pricing', 'MANAGE']) },
  { method: 'DELETE', pattern: '/skills/:id', requires: section('skills', 'MANAGE') },

  // ── Certifications ──────────────────────────────────────────
  // Read alongside skills by the nanny profile editor; same reasoning.
  { method: 'GET', pattern: '/certifications', requires: ANY_ADMIN },
  { method: 'POST', pattern: '/certifications', requires: section('certifications', 'MANAGE') },
  { method: 'PATCH', pattern: '/certifications/:id', requires: section('certifications', 'MANAGE') },
  { method: 'DELETE', pattern: '/certifications/:id', requires: section('certifications', 'MANAGE') },

  // ── Packages ────────────────────────────────────────────────
  { method: 'GET', pattern: '/packages', requires: section('packages', 'VIEW') },
  { method: 'POST', pattern: '/packages', requires: section('packages', 'MANAGE') },
  { method: 'PATCH', pattern: '/packages/:id', requires: section('packages', 'MANAGE') },
  { method: 'DELETE', pattern: '/packages/:id', requires: section('packages', 'MANAGE') },
  { method: 'GET', pattern: '/package-purchases', requires: section('packages', 'VIEW') },
  { method: 'GET', pattern: '/package-purchases/:id', requires: section('packages', 'VIEW') },

  // ── Cameras ─────────────────────────────────────────────────
  { method: 'GET', pattern: '/cameras/nanny-options', requires: section('cameras', 'VIEW') },
  { method: 'GET', pattern: '/cameras', requires: section('cameras', 'VIEW') },
  { method: 'POST', pattern: '/cameras', requires: section('cameras', 'MANAGE') },
  { method: 'PATCH', pattern: '/cameras/:id', requires: section('cameras', 'MANAGE') },
  { method: 'DELETE', pattern: '/cameras/:id', requires: section('cameras', 'MANAGE') },

  // ── Platform configuration ──────────────────────────────────
  // One row read by three pages: Bookings (its SLA thresholds), Pricing & Fees
  // (rates and splits) and Booking Options (everything else).
  {
    method: 'GET',
    pattern: '/config',
    requires: anyOf(['bookings', 'VIEW'], ['pricing', 'VIEW'], ['settings', 'VIEW']),
  },
  { method: 'PUT', pattern: '/config', requires: { kind: 'CONFIG_BODY' } },
  { method: 'GET', pattern: '/support-contact', requires: section('settings', 'VIEW') },
  { method: 'PUT', pattern: '/support-contact', requires: section('settings', 'MANAGE') },

  // ── Pricing ─────────────────────────────────────────────────
  { method: 'GET', pattern: '/duration-rules', requires: section('pricing', 'VIEW') },
  { method: 'POST', pattern: '/duration-rules', requires: section('pricing', 'MANAGE') },
  { method: 'PATCH', pattern: '/duration-rules/:id', requires: section('pricing', 'MANAGE') },
  { method: 'DELETE', pattern: '/duration-rules/:id', requires: section('pricing', 'MANAGE') },
  // Read-only calculator that happens to POST its scenario.
  { method: 'POST', pattern: '/pricing/calculate', requires: section('pricing', 'VIEW') },

  // ── Care Points ─────────────────────────────────────────────
  // The redemption rate is also read by the pricing calculator panel.
  {
    method: 'GET',
    pattern: '/rewards/config',
    requires: anyOf(['rewards', 'VIEW'], ['pricing', 'VIEW']),
  },
  { method: 'PUT', pattern: '/rewards/config', requires: section('rewards', 'MANAGE') },
  { method: 'GET', pattern: '/rewards/wallets', requires: section('rewards', 'VIEW') },
  { method: 'GET', pattern: '/rewards/wallets/:userId', requires: section('rewards', 'VIEW') },
  { method: 'GET', pattern: '/rewards/wallets/:userId/history', requires: section('rewards', 'VIEW') },
  { method: 'POST', pattern: '/rewards/wallets/:userId/grant', requires: section('rewards', 'MANAGE') },
] as const;

// ──────────────────────────────────────────────────────────────
// PUT /config — which section owns each setting
// ──────────────────────────────────────────────────────────────
// `PlatformConfig` is one row edited by two pages. Typed as a total record over
// its keys so adding a setting without deciding who may change it won't compile.

export const CONFIG_KEY_SECTIONS: Record<keyof PlatformConfig, AdminSection> = {
  serviceFeePercent: 'pricing',
  standardHourlyRate: 'pricing',
  nannyPercent: 'pricing',
  platformPercent: 'pricing',
  extraChildFeeType: 'pricing',
  extraChildFeeValue: 'pricing',
  includedChildrenPerBooking: 'settings',
  maxChildrenPerBooking: 'settings',
  maxBookingHours: 'settings',
  minBookingHours: 'settings',
  minAdvanceBookingHours: 'settings',
  cancellationWindowHours: 'settings',
  broadcastRadiusKm: 'settings',
  pendingWarningMinutes: 'settings',
  pendingCriticalMinutes: 'settings',
  bookingWindowStartHour: 'settings',
  bookingWindowEndHour: 'settings',
  revealPhoneMinutes: 'settings',
};

function isConfigKey(key: string): key is keyof PlatformConfig {
  return Object.prototype.hasOwnProperty.call(CONFIG_KEY_SECTIONS, key);
}

/**
 * The sections a `PUT /config` body actually writes. An unknown key maps to
 * nothing here — Zod rejects it moments later, and treating it as "needs no
 * privilege" is safe because it never reaches the database.
 */
export function configBodySections(body: unknown): AdminSection[] {
  if (typeof body !== 'object' || body === null) return [];
  const sections = new Set<AdminSection>();
  for (const key of Object.keys(body)) {
    if (isConfigKey(key)) sections.add(CONFIG_KEY_SECTIONS[key]);
  }
  return [...sections];
}

// ──────────────────────────────────────────────────────────────
// Resolution + evaluation
// ──────────────────────────────────────────────────────────────

/** `/bookings/12/refund` matches `/bookings/:id/refund`. */
function patternMatches(pattern: string, segments: string[]): boolean {
  const patternSegments = pattern.split('/').filter(Boolean);
  if (patternSegments.length !== segments.length) return false;
  return patternSegments.every(
    (patternSegment, index) => patternSegment.startsWith(':') || patternSegment === segments[index],
  );
}

/**
 * The privilege a request needs, or null when the path isn't in the table —
 * which the middleware treats as a refusal, not as "no privilege required".
 */
export function resolveRequirement(method: string, path: string): Requirement | null {
  const segments = path.split('/').filter(Boolean);
  const upperMethod = method.toUpperCase();
  const rule = ADMIN_ROUTE_PERMISSIONS.find(
    (candidate) => candidate.method === upperMethod && patternMatches(candidate.pattern, segments),
  );
  return rule?.requires ?? null;
}

export type AdminIdentity = {
  role: AdminRole;
  permissions: OperatorPermissions;
};

/**
 * `users.admin_permissions` is a free-form JSON column, so it is validated on
 * every read. A malformed or hand-edited value degrades to "no access" rather
 * than to an unpredictable one.
 */
export function parseOperatorPermissions(raw: unknown): OperatorPermissions {
  const parsed = OperatorPermissionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/**
 * What an account actually holds. ADMIN and SUPERUSER have the whole console by
 * virtue of their role — the stored map is only ever consulted for an OPERATOR.
 */
export function effectivePermissions(role: AdminRole, raw: unknown): OperatorPermissions {
  return role === 'OPERATOR' ? parseOperatorPermissions(raw) : FULL_ADMIN_PERMISSIONS;
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: string };

/** Evaluates a resolved requirement against the caller. `body` is only read for PUT /config. */
export function evaluateRequirement(
  requirement: Requirement,
  identity: AdminIdentity,
  body: unknown,
): AccessDecision {
  const { role, permissions } = identity;

  switch (requirement.kind) {
    case 'ANY_ADMIN':
      return { allowed: true };

    case 'SUPERUSER':
      return role === 'SUPERUSER'
        ? { allowed: true }
        : { allowed: false, reason: 'Superuser access required' };

    case 'SECTION': {
      const satisfied = requirement.anyOf.some(([name, level]) =>
        hasSectionAccess(role, permissions, name, level),
      );
      if (satisfied) return { allowed: true };
      return { allowed: false, reason: deniedReason(requirement.anyOf) };
    }

    case 'CONFIG_BODY': {
      // Every section the body touches must be manageable — a pricing operator
      // must not slip a broadcast-radius change into the same request.
      const touched = configBodySections(body);
      const missing = touched.filter((name) => !hasSectionAccess(role, permissions, name, 'MANAGE'));
      if (missing.length === 0) return { allowed: true };
      return {
        allowed: false,
        reason: deniedReason(missing.map((name) => [name, 'MANAGE'] as const)),
      };
    }
  }
}

/** "You don't have permission to manage Pricing & Fees." */
function deniedReason(
  pairs: readonly (readonly [AdminSection, RequiredAccessLevel])[],
): string {
  const [first] = pairs;
  if (!first) return 'You don’t have permission to do this.';
  const [name, level] = first;
  const verb = level === 'MANAGE' ? 'manage' : 'view';
  return `You don’t have permission to ${verb} ${ADMIN_SECTION_LABELS[name]}.`;
}
