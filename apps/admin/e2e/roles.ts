import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OperatorPermissions } from '@nanny-app/shared';

// The admin package is ESM ("type": "module"), so __dirname does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The console accounts the E2E suite signs in as.
 *
 * Declared in one place so a spec asks for a role by name rather than
 * hard-coding credentials, and so global-setup and the specs cannot disagree
 * about which permissions a given operator actually has.
 */
export type RoleName = 'superuser' | 'bookingsOperator';

export type RoleDefinition = {
  email: string;
  password: string;
  /** Console role, as stored on `users.role`. */
  role: 'SUPERUSER' | 'OPERATOR';
  /** Section → access-level map for `users.admin_permissions`. Operators only. */
  permissions?: OperatorPermissions;
};

export const ROLES: Record<RoleName, RoleDefinition> = {
  superuser: {
    email: 'e2e-superuser@test.local',
    password: 'test-password-123',
    role: 'SUPERUSER',
  },
  /**
   * Deliberately narrow: an operator granted one section is what proves the
   * console hides everything else. A "can do everything" operator would be
   * indistinguishable from the superuser.
   */
  bookingsOperator: {
    email: 'e2e-bookings-operator@test.local',
    password: 'test-password-123',
    role: 'OPERATOR',
    permissions: { bookings: 'MANAGE' },
  },
};

/** Where global-setup writes each role's signed-in browser state. */
export function storageStatePath(role: RoleName): string {
  return path.join(HERE, '.auth', `${role}.json`);
}
