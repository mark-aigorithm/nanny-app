import { LegalDocumentKeySchema } from '@nanny-app/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { getLegalDocument } from '@backend/services/legal-document.service';

export const legalRouter = Router();

// Public by design: the registration wizard links here before the user has an
// account. Read-only, and the text is meant to be read by anyone.
legalRouter.get('/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = LegalDocumentKeySchema.safeParse(req.params.key);
    if (!key.success) throw errors.notFound('No such document.');
    res.json(ok(await getLegalDocument(key.data)));
  } catch (err) {
    next(err);
  }
});
