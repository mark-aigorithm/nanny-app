import { Router, type Request, type Response, type NextFunction } from 'express';

import { processPaymobWebhook } from '@backend/services/paymob.service';

export const webhookRouter = Router();

webhookRouter.post(
  '/paymob',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const hmacHex = typeof req.query['hmac'] === 'string' ? req.query['hmac'] : undefined;
      const { accepted } = await processPaymobWebhook({ rawBody: req.body, hmacHex });
      if (!accepted) {
        res.status(401).send('Unauthorized');
        return;
      }
      res.status(200).send('OK');
    } catch (err) {
      next(err);
    }
  },
);
