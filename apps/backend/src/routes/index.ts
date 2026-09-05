import { Router, type Request, type Response } from 'express';

import { config } from '@backend/lib/config';
import { ok } from '@backend/lib/api-response';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { nannyRouter } from './nanny.routes';
import { bookingRouter } from './booking.routes';
import { campaignRouter } from './campaign.routes';
import { communityRouter } from './community.routes';
import { conversationRouter } from './conversation.routes';
import { deviceRouter } from './device.routes';
import { notificationRouter } from './notification.routes';
import { packageRouter } from './package.routes';
import { paymobRouter } from './paymob.routes';
import { qaRouter } from './qa.routes';
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
apiRouter.use('/campaigns', campaignRouter);
apiRouter.use('/community', communityRouter);
apiRouter.use('/conversations', conversationRouter);
apiRouter.use('/devices', deviceRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/packages', packageRouter);
apiRouter.use('/referrals', referralRouter);
apiRouter.use('/rewards', rewardRouter);
apiRouter.use('/support', supportRouter);

// Unauthenticated by design — see qa.routes.ts. Mounted only when the flag is
// on, so an environment that is not running a release test never exposes it.
if (config.qaChecklistEnabled) {
  apiRouter.use('/qa-checklist', qaRouter);
}
