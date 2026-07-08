import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

import { errors } from '@backend/lib/errors';

export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      next(errors.badRequest(issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid request body'));
      return;
    }
    req.body = result.data as z.infer<S>;
    next();
  };
}

export function validateQuery<S extends ZodTypeAny>(schema: S) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issue = result.error.issues[0];
      next(errors.badRequest(issue ? `${issue.path.join('.') || 'query'}: ${issue.message}` : 'Invalid query parameters'));
      return;
    }
    res.locals['validatedQuery'] = result.data as z.infer<S>;
    next();
  };
}
