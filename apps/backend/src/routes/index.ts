import { Router, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { authRouter } from './auth.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json(ok({ status: 'ok' }));
});

apiRouter.use('/auth', authRouter);
