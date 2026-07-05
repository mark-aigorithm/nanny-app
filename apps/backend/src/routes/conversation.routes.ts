import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  ConversationListQuerySchema,
  MessageHistoryQuerySchema,
  SendMessageSchema,
} from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { routeParam } from '@backend/lib/route-param';
import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody, validateQuery } from '@backend/middleware/validate.middleware';
import {
  getConversation,
  getUnreadMessageCount,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
} from '@backend/services/conversation.service';

export const conversationRouter = Router();

conversationRouter.get(
  '/',
  requireAuth,
  validateQuery(ConversationListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const query = res.locals['validatedQuery'] as ReturnType<
        typeof ConversationListQuerySchema.parse
      >;
      const result = await listConversations(req.firebaseUser, query);
      res.json({ data: result.conversations, error: null, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },
);

conversationRouter.get(
  '/unread-count',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await getUnreadMessageCount(req.firebaseUser);
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

conversationRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const conversation = await getConversation(req.firebaseUser, routeParam(req.params.id));
      res.json(ok(conversation));
    } catch (err) {
      next(err);
    }
  },
);

conversationRouter.get(
  '/:id/messages',
  requireAuth,
  validateQuery(MessageHistoryQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const query = res.locals['validatedQuery'] as ReturnType<
        typeof MessageHistoryQuerySchema.parse
      >;
      const result = await listMessages(req.firebaseUser, routeParam(req.params.id), query);
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

conversationRouter.post(
  '/:id/messages',
  requireAuth,
  validateBody(SendMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const message = await sendMessage(req.firebaseUser, routeParam(req.params.id), req.body);
      res.status(201).json(ok(message));
    } catch (err) {
      next(err);
    }
  },
);

conversationRouter.post(
  '/:id/read',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await markConversationRead(req.firebaseUser, routeParam(req.params.id));
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);
