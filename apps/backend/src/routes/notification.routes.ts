import { Router, type NextFunction, type Request, type Response } from 'express';

import { NotificationListQuerySchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { routeParam } from '@backend/lib/route-param';
import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateQuery } from '@backend/middleware/validate.middleware';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@backend/services/notification.service';

export const notificationRouter = Router();

notificationRouter.get(
  '/',
  requireAuth,
  validateQuery(NotificationListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const query = res.locals['validatedQuery'] as ReturnType<
        typeof NotificationListQuerySchema.parse
      >;
      const result = await listNotifications(req.firebaseUser, query);
      res.json({ data: result.notifications, error: null, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.get(
  '/unread-count',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await getUnreadNotificationCount(req.firebaseUser);
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.patch(
  '/read-all',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await markAllNotificationsRead(req.firebaseUser);
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

notificationRouter.patch(
  '/:id/read',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const notification = await markNotificationRead(
        req.firebaseUser,
        routeParam(req.params.id),
      );
      res.json(ok(notification));
    } catch (err) {
      next(err);
    }
  },
);
