import { Router, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { authRouter } from './auth.routes';
import { nannyRouter } from './nanny.routes';
import { bookingRouter } from './booking.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json(ok({ status: 'ok' }));
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/nanny', nannyRouter);
apiRouter.use('/bookings', bookingRouter);
