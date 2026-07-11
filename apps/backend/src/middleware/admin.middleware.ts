import type { NextFunction, Request, Response } from 'express';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * Requires `requireAuth` to have run first. Loads the user by Firebase UID
 * and rejects with 403 unless their role is ADMIN or SUPERUSER.
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
      select: { role: true, deletedAt: true },
    });
    if (
      !user ||
      user.deletedAt !== null ||
      (user.role !== 'ADMIN' && user.role !== 'SUPERUSER')
    ) {
      throw errors.forbidden('Admin access required');
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires `requireAuth` to have run first. Only the SUPERUSER (root)
 * account may pass — used for managing admin accounts.
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
