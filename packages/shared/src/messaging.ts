import { z } from 'zod';

import { CommunityAuthorSchema } from './community';
import { PaginationMetaSchema } from './booking';

export const ConversationTypeSchema = z.enum(['marketplace']);
export type ConversationType = z.infer<typeof ConversationTypeSchema>;

export const MessageTypeSchema = z.enum(['text']);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const ListingContextSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  price: z.number().nullable(),
  imageUrl: z.string().nullable(),
});

export type ListingContext = z.infer<typeof ListingContextSchema>;

export const MessageResponseSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  type: MessageTypeSchema,
  content: z.string(),
  sender: CommunityAuthorSchema,
  createdAt: z.string(),
});

export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export const ConversationResponseSchema = z.object({
  id: z.string(),
  type: ConversationTypeSchema,
  listingContext: ListingContextSchema,
  otherParticipant: CommunityAuthorSchema,
  lastMessage: MessageResponseSchema.nullable(),
  unreadCount: z.number(),
  updatedAt: z.string(),
  createdAt: z.string(),
});

export type ConversationResponse = z.infer<typeof ConversationResponseSchema>;

export const ConversationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;

export const ConversationListResponseSchema = z.object({
  conversations: z.array(ConversationResponseSchema),
  meta: PaginationMetaSchema,
});

export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

export const MessageHistoryQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type MessageHistoryQuery = z.infer<typeof MessageHistoryQuerySchema>;

export const MessageListResponseSchema = z.object({
  messages: z.array(MessageResponseSchema),
  hasMore: z.boolean(),
});

export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

export const SendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(5000),
});

export type SendMessageRequest = z.infer<typeof SendMessageSchema>;

export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number(),
});

export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

export const ContactSellerResponseSchema = z.object({
  conversation: ConversationResponseSchema,
});

export type ContactSellerResponse = z.infer<typeof ContactSellerResponseSchema>;
