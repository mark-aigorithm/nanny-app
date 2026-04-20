import { Router, type Request, type Response, type NextFunction } from 'express';

import {
  BookingListQuerySchema,
  CancelBookingSchema,
  CreateBookingSchema,
  CreateEmergencyBookingSchema,
  MockPayBookingSchema,
} from '@nanny-app/shared';

import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody, validateQuery } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import {
  acceptBooking,
  cancelBooking,
  checkOutBooking,
  createBooking,
  createEmergencyBooking,
  getBooking,
  listBookings,
  mockPayBooking,
} from '@backend/services/booking.service';

export const bookingRouter = Router();

// POST /bookings/emergency must be declared BEFORE /bookings/:id routes
// so Express doesn't treat "emergency" as a booking ID.

bookingRouter.post(
  '/emergency',
  requireAuth,
  validateBody(CreateEmergencyBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await createEmergencyBooking(req.firebaseUser, req.body);
      res.status(201).json(ok(result));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/',
  requireAuth,
  validateBody(CreateBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const booking = await createBooking(req.firebaseUser, req.body);
      res.status(201).json(ok(booking));
    } catch (err) { next(err); }
  },
);

bookingRouter.get(
  '/',
  requireAuth,
  validateQuery(BookingListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await listBookings(req.firebaseUser, res.locals['validatedQuery']);
      res.json({ data: result.bookings, error: null, meta: result.meta });
    } catch (err) { next(err); }
  },
);

bookingRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const booking = await getBooking(req.firebaseUser, String(req.params['id']));
      res.json(ok(booking));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/pay',
  requireAuth,
  validateBody(MockPayBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await mockPayBooking(req.firebaseUser, String(req.params['id']), req.body);
      res.json(ok(result));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/cancel',
  requireAuth,
  validateBody(CancelBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await cancelBooking(req.firebaseUser, String(req.params['id']), req.body);
      res.json(ok(result));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/accept',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const booking = await acceptBooking(req.firebaseUser, String(req.params['id']));
      res.json(ok(booking));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/check-out',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const booking = await checkOutBooking(req.firebaseUser, String(req.params['id']));
      res.json(ok(booking));
    } catch (err) { next(err); }
  },
);
