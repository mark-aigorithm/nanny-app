import type { NextFunction, Request, Response } from 'express';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * Requires `requireAuth` to have run first. Loads the user by Firebase UID
 * and rejects with 403 unless their role is ADMIN.
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
    if (!user || user.deletedAt !== null || user.role !== 'ADMIN') {
      throw errors.forbidden('Admin access required');
    }
    next();
  } catch (err) {
    next(err);
  }
}
