import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  CommentListQuerySchema,
  CommunityFeedQuerySchema,
  CreateCommentSchema,
  CreateCommunityPostSchema,
  UpdateCommunityPostSchema,
} from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { routeParam } from '@backend/lib/route-param';
import { errors } from '@backend/lib/errors';
import { optionalAuth, requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody, validateQuery } from '@backend/middleware/validate.middleware';
import {
  createComment,
  createPost,
  deletePost,
  getPost,
  listComments,
  listPosts,
  toggleCommentLike,
  toggleEventRsvp,
  togglePostLike,
  updatePost,
} from '@backend/services/community.service';
import { contactSeller } from '@backend/services/conversation.service';

export const communityRouter = Router();

// Feed reads use optionalAuth: guests (no account yet) may browse the feed
// read-only; signed-in users get their own likedByMe/rsvpdByMe flags.
communityRouter.get(
  '/posts',
  optionalAuth,
  validateQuery(CommunityFeedQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as ReturnType<
        typeof CommunityFeedQuerySchema.parse
      >;
      const result = await listPosts(req.firebaseUser ?? null, query);
      res.json({ data: result.posts, error: null, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.post(
  '/posts',
  requireAuth,
  validateBody(CreateCommunityPostSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const post = await createPost(req.firebaseUser, req.body);
      res.status(201).json(ok(post));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.get(
  '/posts/:id',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const post = await getPost(req.firebaseUser ?? null, routeParam(req.params.id));
      res.json(ok(post));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.patch(
  '/posts/:id',
  requireAuth,
  validateBody(UpdateCommunityPostSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const post = await updatePost(req.firebaseUser, routeParam(req.params.id), req.body);
      res.json(ok(post));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.delete(
  '/posts/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      await deletePost(req.firebaseUser, routeParam(req.params.id));
      res.json(ok({ deleted: true }));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.post(
  '/posts/:id/contact',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const conversation = await contactSeller(req.firebaseUser, routeParam(req.params.id));
      res.status(201).json(ok({ conversation }));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.post(
  '/posts/:id/like',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await togglePostLike(req.firebaseUser, routeParam(req.params.id));
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.get(
  '/posts/:id/comments',
  optionalAuth,
  validateQuery(CommentListQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as ReturnType<
        typeof CommentListQuerySchema.parse
      >;
      const result = await listComments(req.firebaseUser ?? null, routeParam(req.params.id), query);
      res.json({ data: result.comments, error: null, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.post(
  '/posts/:id/comments',
  requireAuth,
  validateBody(CreateCommentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const comment = await createComment(req.firebaseUser, routeParam(req.params.id), req.body);
      res.status(201).json(ok(comment));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.post(
  '/comments/:id/like',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await toggleCommentLike(req.firebaseUser, routeParam(req.params.id));
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

communityRouter.post(
  '/posts/:id/rsvp',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await toggleEventRsvp(req.firebaseUser, routeParam(req.params.id));
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);
