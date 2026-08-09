import type { NextFunction, Request, Response } from 'express';

import type { AdminRole } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import {
  effectivePermissions,
  evaluateRequirement,
  resolveRequirement,
  type AdminIdentity,
} from '@backend/lib/admin-permissions';
import { errors } from '@backend/lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * The console account behind the request, populated by `requireAdmin`
       * so the privilege check doesn't re-query the user on every call.
       */
      adminUser?: AdminIdentity & { id: number };
    }
  }
}

const ADMIN_ROLES: readonly AdminRole[] = ['ADMIN', 'SUPERUSER', 'OPERATOR'];

function isAdminRole(role: string | null): role is AdminRole {
  return role !== null && (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Requires `requireAuth` to have run first. Loads the user by Firebase UID and
 * rejects with 403 unless they hold a console role (ADMIN, SUPERUSER or
 * OPERATOR). Attaches the account — including an operator's granted sections —
 * to `req.adminUser` for `requireSectionAccess`.
 */
export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUser.uid },
      select: { id: true, role: true, adminPermissions: true, isActive: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null || !isAdminRole(user.role)) {
      throw errors.forbidden('Admin access required');
    }
    if (!user.isActive) {
      throw errors.forbidden('This account has been deactivated.');
    }
    req.adminUser = {
      id: user.id,
      role: user.role,
      permissions: effectivePermissions(user.role, user.adminPermissions),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires `requireAdmin` to have run first. Looks the request up in the
 * route → privilege table and refuses anything the account doesn't hold.
 *
 * Mounted once for the whole admin router, so no individual handler can forget
 * it. A path missing from the table is refused rather than waved through —
 * that's what keeps a newly added route from shipping unprotected.
 */
export function requireSectionAccess(req: Request, _res: Response, next: NextFunction): void {
  const identity = req.adminUser;
  if (!identity) {
    next(errors.forbidden('Admin access required'));
    return;
  }

  const requirement = resolveRequirement(req.method, req.path);
  if (!requirement) {
    next(errors.forbidden('You don’t have permission to do this.'));
    return;
  }

  const decision = evaluateRequirement(requirement, identity, req.body);
  if (!decision.allowed) {
    next(errors.forbidden(decision.reason));
    return;
  }
  next();
}

/**
 * Requires `requireAuth` to have run first. Only the SUPERUSER (root)
 * account may pass — used for managing admin and operator accounts.
 */
export async function requireSuperuser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUser.uid },
      select: { role: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null || user.role !== 'SUPERUSER') {
      throw errors.forbidden('Superuser access required');
    }
    next();
  } catch (err) {
    next(err);
  }
}
