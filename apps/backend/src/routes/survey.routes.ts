import { Router, type NextFunction, type Request, type Response } from 'express';

import { SubmitSurveyAnswersSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeIdParam } from '@backend/lib/route-param';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  getMySurvey,
  listMyPendingSurveys,
  skipMySurvey,
  submitMySurveyAnswers,
} from '@backend/services/survey.service';

/**
 * Surveys an admin sent the signed-in mother. Mothers only — the service
 * enforces it. `/pending` drives both the app-open prompt and the profile list.
 */
export const surveyRouter = Router();

surveyRouter.get('/pending', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await listMyPendingSurveys(req.firebaseUser)));
  } catch (err) {
    next(err);
  }
});

surveyRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getMySurvey(req.firebaseUser, routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

surveyRouter.post('/:id/skip', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    await skipMySurvey(req.firebaseUser, routeIdParam(req.params.id));
    res.json(ok({ status: 'SKIPPED' as const }));
  } catch (err) {
    next(err);
  }
});

surveyRouter.post(
  '/:id/answers',
  requireAuth,
  validateBody(SubmitSurveyAnswersSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      await submitMySurveyAnswers(req.firebaseUser, routeIdParam(req.params.id), req.body);
      res.json(ok({ status: 'ANSWERED' as const }));
    } catch (err) {
      next(err);
    }
  },
);
