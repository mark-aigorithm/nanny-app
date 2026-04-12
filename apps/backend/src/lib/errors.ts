/**
 * Throw from services/middleware for expected, user-facing errors.
 * The global error handler maps these to the right HTTP status with a
 * friendly message. Anything else (e.g. a Prisma crash) becomes a 500.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}

export const errors = {
  unauthorized: (message = 'Unauthorized') => new AppError(message, 401),
  forbidden: (message = 'Forbidden') => new AppError(message, 403),
  notFound: (message = 'Not found') => new AppError(message, 404),
  conflict: (message: string) => new AppError(message, 409),
  badRequest: (message: string) => new AppError(message, 400),
};
