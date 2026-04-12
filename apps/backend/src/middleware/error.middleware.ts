import type { NextFunction, Request, Response } from 'express';

import { AppError } from '@backend/lib/errors';
import { fail } from '@backend/lib/api-response';
import { config } from '@backend/lib/config';

/**
 * Global error handler — the ONLY place that calls `res.status().json()`
 * for errors. Maps `AppError` to its statusCode; logs unexpected errors
 * and returns a generic 500 to the client.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(fail(err.message));
    return;
  }

  // Unexpected error — log it for diagnostics, but don't leak details to the
  // client. In dev we include the message so debugging is faster.
  // eslint-disable-next-line no-console
  console.error('[error]', err);

  const message =
    config.nodeEnv === 'development' && err instanceof Error
      ? err.message
      : 'Internal server error';

  res.status(500).json(fail(message));
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(fail(`Route not found: ${req.method} ${req.originalUrl}`));
}
