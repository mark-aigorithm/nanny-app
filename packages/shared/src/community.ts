import { z } from 'zod';

import { PaginationMetaSchema } from './booking';

// ──────────────────────────────────────────────────────────────
// Community — shared Zod schemas
// ──────────────────────────────────────────────────────────────

export const COMMUNITY_TAGS = [
  'Parenting',
  'Sleep',
  'Feeding',
  'Activities',
  'Health',
  'Development',
  'Nanny tips',
  'Local',
] as const;

export const CommunityTagSchema = z.enum(COMMUNITY_TAGS);
export type CommunityTag = z.infer<typeof CommunityTagSchema>;

export const CommunityPostTypeSchema = z.enum(['qa', 'marketplace', 'event']);
export type CommunityPostType = z.infer<typeof CommunityPostTypeSchema>;

const tagsField = z
  .array(CommunityTagSchema)
  .max(5, 'At most 5 tags allowed')
  .default([]);

const baseCreateFields = {
  tags: tagsField,
  imageUrls: z.array(z.string().url()).max(4).default([]),
};

export const CreateCommunityPostSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('qa'),
      title: z.string().trim().max(200).optional(),
      body: z.string().trim().min(1, 'Body is required').max(2000),
      ...baseCreateFields,
    }),
    z.object({
      type: z.literal('marketplace'),
      title: z.string().trim().min(1, 'Product name is required').max(200),
      body: z.string().trim().max(2000).optional(),
      price: z.number().positive('Price must be greater than 0'),
      imageUrls: z.array(z.string().url()).min(1, 'At least one image is required').max(4),
      tags: tagsField,
    }),
    z.object({
      type: z.literal('event'),
      title: z.string().trim().min(1, 'Event name is required').max(200),
      body: z.string().trim().max(2000).optional(),
      eventStartsAt: z.string().datetime({ message: 'Valid event date/time is required' }),
      location: z.string().trim().min(1, 'Location is required').max(500),
      price: z.number().nonnegative().optional(),
      maxAttendees: z.number().int().positive().optional(),
      ...baseCreateFields,
    }),
  ]);

export type CreateCommunityPostRequest = z.infer<typeof CreateCommunityPostSchema>;

export const UpdateCommunityPostSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(2000).optional(),
  imageUrls: z.array(z.string().url()).max(4).optional(),
  price: z.number().nonnegative().optional(),
  location: z.string().trim().min(1).max(500).optional(),
  eventStartsAt: z.string().datetime().optional(),
  maxAttendees: z.number().int().positive().nullable().optional(),
  tags: z.array(CommunityTagSchema).max(5).optional(),
});

export type UpdateCommunityPostRequest = z.infer<typeof UpdateCommunityPostSchema>;

export const CommunityFeedQuerySchema = z.object({
  type: CommunityPostTypeSchema.optional(),
  tag: CommunityTagSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type CommunityFeedQuery = z.infer<typeof CommunityFeedQuerySchema>;

export const CommunityAuthorSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
});

export type CommunityAuthor = z.infer<typeof CommunityAuthorSchema>;

export const CommunityPostResponseSchema = z.object({
  id: z.string(),
  type: CommunityPostTypeSchema,
  title: z.string().nullable(),
  body: z.string().nullable(),
  imageUrls: z.array(z.string()),
  price: z.number().nullable(),
  location: z.string().nullable(),
  eventStartsAt: z.string().nullable(),
  maxAttendees: z.number().nullable(),
  rsvpCount: z.number(),
  tags: z.array(z.string()),
  likeCount: z.number(),
  commentCount: z.number(),
  likedByMe: z.boolean(),
  rsvpdByMe: z.boolean(),
  author: CommunityAuthorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CommunityPostResponse = z.infer<typeof CommunityPostResponseSchema>;

export const CommunityFeedResponseSchema = z.object({
  posts: z.array(CommunityPostResponseSchema),
  meta: PaginationMetaSchema,
});

export type CommunityFeedResponse = z.infer<typeof CommunityFeedResponseSchema>;

export const CreateCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(1000),
  parentCommentId: z.string().optional(),
});

export type CreateCommentRequest = z.infer<typeof CreateCommentSchema>;

export const CommentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type CommentListQuery = z.infer<typeof CommentListQuerySchema>;

export const CommentResponseSchema: z.ZodType<CommentResponse> = z.lazy(() =>
  z.object({
    id: z.string(),
    postId: z.string(),
    body: z.string(),
    likeCount: z.number(),
    likedByMe: z.boolean(),
    author: CommunityAuthorSchema,
    parentCommentId: z.string().nullable(),
    replies: z.array(CommentResponseSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

export interface CommentResponse {
  id: string;
  postId: string;
  body: string;
  likeCount: number;
  likedByMe: boolean;
  author: CommunityAuthor;
  parentCommentId: string | null;
  replies: CommentResponse[];
  createdAt: string;
  updatedAt: string;
}

export const CommentListResponseSchema = z.object({
  comments: z.array(CommentResponseSchema),
  meta: PaginationMetaSchema,
});

export type CommentListResponse = z.infer<typeof CommentListResponseSchema>;

export const ToggleLikeResponseSchema = z.object({
  liked: z.boolean(),
  likeCount: z.number(),
});

export type ToggleLikeResponse = z.infer<typeof ToggleLikeResponseSchema>;

export const ToggleRsvpResponseSchema = z.object({
  rsvpd: z.boolean(),
  rsvpCount: z.number(),
});

export type ToggleRsvpResponse = z.infer<typeof ToggleRsvpResponseSchema>;
