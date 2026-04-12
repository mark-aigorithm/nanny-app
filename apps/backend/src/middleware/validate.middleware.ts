import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

import { errors } from '@backend/lib/errors';

/**
 * Validates `req.body` against a Zod schema and replaces it with the
 * parsed (typed, coerced) value. On failure, raises a 400 with the first
 * issue's message.
 */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue
        ? `${issue.path.join('.') || 'body'}: ${issue.message}`
        : 'Invalid request body';
      next(errors.badRequest(message));
      return;
    }
    req.body = result.data as z.infer<S>;
    next();
  };
}
