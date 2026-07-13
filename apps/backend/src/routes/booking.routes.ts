import { Router, type Request, type Response, type NextFunction } from 'express';

import {
  BookingListQuerySchema,
  CancelBookingSchema,
  CreateBookingSchema,
  CreateCareLogSchema,
  CreatePaymobIntentionSchema,
  MockPayBookingSchema,
  ValidateBookingPromoSchema,
} from '@nanny-app/shared';

import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody, validateQuery } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import {
  acceptBooking,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  createBooking,
  declineBooking,
  getBooking,
  getBookingPricingConfig,
  listAvailableBookings,
  listBookings,
  mockPayBooking,
  validateBookingPromo,
} from '@backend/services/booking.service';
import { createCareLog, listCareLogs } from '@backend/services/care-log.service';
import {
  createPaymobIntentionForBooking,
  syncPaymobPaymentForBooking,
} from '@backend/services/paymob.service';

export const bookingRouter = Router();

bookingRouter.get(
  '/pricing',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await getBookingPricingConfig()));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/validate-promo',
  requireAuth,
  validateBody(ValidateBookingPromoSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await validateBookingPromo(req.firebaseUser, req.body);
      res.json(ok(result));
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

// GET /bookings/available must be declared BEFORE /bookings/:id so Express
// doesn't treat "available" as a booking ID.
bookingRouter.get(
  '/available',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const bookings = await listAvailableBookings(req.firebaseUser);
      res.json(ok(bookings));
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
  '/:id/pay/paymob',
  requireAuth,
  validateBody(CreatePaymobIntentionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await createPaymobIntentionForBooking(
        req.firebaseUser,
        String(req.params['id']),
        req.body,
      );
      res.status(201).json(ok(result));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/pay/paymob/sync',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const bookingId = String(req.params['id']);
      await syncPaymobPaymentForBooking(req.firebaseUser, bookingId);
      const booking = await getBooking(req.firebaseUser, bookingId);
      res.json(ok(booking));
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
  '/:id/decline',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const booking = await declineBooking(req.firebaseUser, String(req.params['id']));
      res.json(ok(booking));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/check-in',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const booking = await checkInBooking(req.firebaseUser, String(req.params['id']));
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

bookingRouter.get(
  '/:id/care-logs',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const logs = await listCareLogs(req.firebaseUser, String(req.params['id']));
      res.json(ok(logs));
    } catch (err) { next(err); }
  },
);

bookingRouter.post(
  '/:id/care-logs',
  requireAuth,
  validateBody(CreateCareLogSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const log = await createCareLog(req.firebaseUser, String(req.params['id']), req.body);
      res.status(201).json(ok(log));
    } catch (err) { next(err); }
  },
);
