import type { NextFunction, Request, Response } from 'express';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * Requires `requireAuth` to have run first. Rejects with 403 unless the
 * caller is a nanny whose profile an admin has APPROVED — new nannies stay
 * PENDING_REVIEW until vetted and cannot use operational nanny endpoints.
 */
export async function requireApprovedNanny(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUser.uid },
      select: {
        role: true,
        deletedAt: true,
        idVerificationStatus: true,
        nannyProfile: { select: { deletedAt: true } },
      },
    });
    if (!user || user.deletedAt !== null || user.role !== 'NANNY' || !user.nannyProfile) {
      throw errors.forbidden('Nanny access required');
    }
    if (
      user.nannyProfile.deletedAt !== null ||
      user.idVerificationStatus !== 'APPROVED'
    ) {
      throw errors.forbidden('Your nanny profile has not been approved yet.');
    }
    next();
  } catch (err) {
    next(err);
  }
}
