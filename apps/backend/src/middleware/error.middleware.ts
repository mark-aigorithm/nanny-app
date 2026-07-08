import type { NextFunction, Request, Response } from 'express';

import { AppError } from '@backend/lib/errors';
import { fail } from '@backend/lib/api-response';

/**
 * Global error handler — the ONLY place that calls `res.status().json()`
 * for errors. Maps `AppError` to its statusCode; logs unexpected errors
 * and returns a generic 500 to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 400) {
      // eslint-disable-next-line no-console
      console.warn('[http]', req.method, req.originalUrl, err.statusCode, err.message);
    }
    res.status(err.statusCode).json(fail(err.message));
    return;
  }

  // Unexpected error — log full details server-side; client gets generic copy.
  // eslint-disable-next-line no-console
  console.error('[error]', err);

  res.status(500).json(fail('Something went wrong. Please try again.'));
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(fail(`Route not found: ${req.method} ${req.originalUrl}`));
}
