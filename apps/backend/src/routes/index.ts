import { Router, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { nannyRouter } from './nanny.routes';
import { bookingRouter } from './booking.routes';
import { communityRouter } from './community.routes';
import { conversationRouter } from './conversation.routes';
import { deviceRouter } from './device.routes';
import { notificationRouter } from './notification.routes';
import { paymobRouter } from './paymob.routes';
import { referralRouter } from './referral.routes';
import { rewardRouter } from './reward.routes';
import { supportRouter } from './support.routes';
import { webhookRouter } from './webhook.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json(ok({ status: 'ok' }));
});

apiRouter.use('/webhooks', webhookRouter);
apiRouter.use('/paymob', paymobRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/nanny', nannyRouter);
apiRouter.use('/bookings', bookingRouter);
apiRouter.use('/community', communityRouter);
apiRouter.use('/conversations', conversationRouter);
apiRouter.use('/devices', deviceRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/referrals', referralRouter);
apiRouter.use('/rewards', rewardRouter);
apiRouter.use('/support', supportRouter);
