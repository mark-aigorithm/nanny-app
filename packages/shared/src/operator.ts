import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Operator privileges — shared authority for admin-console access
// ──────────────────────────────────────────────────────────────
// An OPERATOR is an admin-console account whose reach is defined per
// section by the superuser. ADMIN and SUPERUSER always have everything.
//
// This module is the *only* place the access rules are expressed: the
// backend middleware and the admin UI both call `hasSectionAccess`, so
// what the sidebar hides and what the API refuses can never drift.
// ──────────────────────────────────────────────────────────────

/**
 * The privilege subjects — one per nav entry in the admin console.
 * Order matters: it drives the permission matrix and the "first page an
 * operator may land on" fallback.
 */
export const ADMIN_SECTIONS = [
  'dashboard',
  'bookings',
  'users',
  'promoCodes',
  'campaigns',
  'marketplace',
  'skills',
  'certifications',
  'packages',
  'rewards',
  'pricing',
  'cameras',
  'settings',
] as const;

export const AdminSectionSchema = z.enum(ADMIN_SECTIONS);
export type AdminSection = z.infer<typeof AdminSectionSchema>;

/** Human labels, matching the sidebar wording exactly. */
export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  dashboard: 'Dashboard',
  bookings: 'Bookings',
  users: 'Users',
  promoCodes: 'Promo Codes',
  campaigns: 'Campaigns',
  marketplace: 'Marketplace',
  skills: 'Nanny Skills',
  certifications: 'Certifications',
  packages: 'Packages',
  rewards: 'Care Points',
  pricing: 'Pricing & Fees',
  cameras: 'Cameras',
  settings: 'Booking Options',
};

/** The admin-console route each section lands on — used for nav and redirects. */
export const ADMIN_SECTION_PATHS: Record<AdminSection, string> = {
  dashboard: '/',
  bookings: '/bookings',
  users: '/users',
  promoCodes: '/promo-codes',
  campaigns: '/campaigns',
  marketplace: '/marketplace',
  skills: '/skills',
  certifications: '/certifications',
  packages: '/packages',
  rewards: '/rewards',
  pricing: '/pricing',
  cameras: '/cameras',
  settings: '/settings',
};

/**
 * NONE is never stored — a section missing from the map already means no
 * access. It exists so the permission matrix has a third radio to select.
 */
export const AdminAccessLevelSchema = z.enum(['NONE', 'VIEW', 'MANAGE']);
export type AdminAccessLevel = z.infer<typeof AdminAccessLevelSchema>;

/** The level a request needs. NONE is not a requirement anything can ask for. */
export type RequiredAccessLevel = Exclude<AdminAccessLevel, 'NONE'>;

/**
 * An operator's granted levels. Written as an explicit optional-key object
 * rather than `z.record` so the inferred type is genuinely partial — a missing
 * section must read as `undefined`, not as a guaranteed level.
 */
export const OperatorPermissionsSchema = z.object({
  dashboard: AdminAccessLevelSchema.optional(),
  bookings: AdminAccessLevelSchema.optional(),
  users: AdminAccessLevelSchema.optional(),
  promoCodes: AdminAccessLevelSchema.optional(),
  campaigns: AdminAccessLevelSchema.optional(),
  marketplace: AdminAccessLevelSchema.optional(),
  skills: AdminAccessLevelSchema.optional(),
  certifications: AdminAccessLevelSchema.optional(),
  packages: AdminAccessLevelSchema.optional(),
  rewards: AdminAccessLevelSchema.optional(),
  pricing: AdminAccessLevelSchema.optional(),
  cameras: AdminAccessLevelSchema.optional(),
  settings: AdminAccessLevelSchema.optional(),
});
export type OperatorPermissions = z.infer<typeof OperatorPermissionsSchema>;

type AssertExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time guard: adding a section to ADMIN_SECTIONS without adding it to
 * OperatorPermissionsSchema (or vice versa) breaks the build here rather than
 * silently shipping a section nobody can be granted.
 */
export const SECTIONS_COVER_PERMISSIONS: AssertExact<
  AdminSection,
  keyof OperatorPermissions
> = true;

/** Roles that can sign in to the admin console. */
export const AdminRoleSchema = z.enum(['ADMIN', 'SUPERUSER', 'OPERATOR']);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

/** Every section at MANAGE — what ADMIN and SUPERUSER effectively hold. */
export const FULL_ADMIN_PERMISSIONS: OperatorPermissions = Object.fromEntries(
  ADMIN_SECTIONS.map((section) => [section, 'MANAGE' as const]),
) as OperatorPermissions;

/**
 * The one authority on "may this account do this".
 *
 * ADMIN and SUPERUSER short-circuit to true — their reach is the whole console
 * and is not stored as a permission map. For an OPERATOR, MANAGE implies VIEW;
 * a section that is absent, or explicitly NONE, grants nothing.
 */
export function hasSectionAccess(
  role: AdminRole,
  permissions: OperatorPermissions,
  section: AdminSection,
  level: RequiredAccessLevel,
): boolean {
  if (role === 'ADMIN' || role === 'SUPERUSER') return true;
  const granted = permissions[section];
  if (granted === undefined || granted === 'NONE') return false;
  return level === 'VIEW' || granted === 'MANAGE';
}

/**
 * The path an operator should land on — their highest-priority permitted
 * section, in ADMIN_SECTIONS order. Returns null when they hold nothing, which
 * the console renders as a "no access" state rather than a redirect loop.
 */
export function firstPermittedPath(
  role: AdminRole,
  permissions: OperatorPermissions,
): string | null {
  const section = ADMIN_SECTIONS.find((candidate) =>
    hasSectionAccess(role, permissions, candidate, 'VIEW'),
  );
  return section ? ADMIN_SECTION_PATHS[section] : null;
}

/** Counts for the operator table's "4 view · 2 manage" summary cell. */
export function summarisePermissions(permissions: OperatorPermissions): {
  view: number;
  manage: number;
} {
  let view = 0;
  let manage = 0;
  for (const section of ADMIN_SECTIONS) {
    const granted = permissions[section];
    if (granted === 'MANAGE') manage += 1;
    else if (granted === 'VIEW') view += 1;
  }
  return { view, manage };
}
