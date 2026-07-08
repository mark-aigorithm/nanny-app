import {
  Role,
  type ConversationListQuery,
  type ConversationListResponse,
  type ConversationResponse,
  type ListingContext,
  type MessageHistoryQuery,
  type MessageListResponse,
  type MessageResponse,
  type PaginationMeta,
  type SendMessageRequest,
} from '@nanny-app/shared';
import {
  CommunityPostType,
  ConversationType,
  MessageType,
  NotificationReferenceType,
  NotificationType,
  Prisma,
  type User,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

const conversationInclude = {
  communityPost: { include: { author: true } },
  participants: { include: { user: true } },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { sender: true },
  },
} as const;

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function requireMother(user: User): void {
  if (user.role !== Role.MOTHER) {
    throw errors.forbidden('Only mothers can use messaging features.');
  }
}

function toAuthor(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
  };
}

function toListingContext(post: {
  id: string;
  title: string | null;
  price: Prisma.Decimal | null;
  imageUrls: string[];
}): ListingContext {
  return {
    id: post.id,
    title: post.title,
    price: post.price !== null ? Number(post.price) : null,
    imageUrl: post.imageUrls[0] ?? null,
  };
}

function toMessageResponse(message: {
  id: string;
  conversationId: string;
  type: MessageType;
  content: string;
  createdAt: Date;
  sender: User;
}): MessageResponse {
  return {
    id: message.id,
    conversationId: message.conversationId,
    type: 'text',
    content: message.content,
    sender: toAuthor(message.sender),
    createdAt: message.createdAt.toISOString(),
  };
}

async function countUnread(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
): Promise<number> {
  return prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      senderId: { not: userId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

function getOtherParticipant(
  conversation: ConversationWithRelations,
  currentUserId: string,
): User {
  const participant = conversation.participants.find((p) => p.userId !== currentUserId);
  if (!participant) throw errors.notFound('Conversation participant not found');
  return participant.user;
}

async function toConversationResponse(
  conversation: ConversationWithRelations,
  currentUserId: string,
): Promise<ConversationResponse> {
  const myParticipant = conversation.participants.find((p) => p.userId === currentUserId);
  const unreadCount = await countUnread(
    conversation.id,
    currentUserId,
    myParticipant?.lastReadAt ?? null,
  );

  const lastMessageRow = conversation.messages[0];
  const lastMessage = lastMessageRow ? toMessageResponse(lastMessageRow) : null;

  return {
    id: conversation.id,
    type: 'marketplace',
    listingContext: toListingContext(conversation.communityPost),
    otherParticipant: toAuthor(getOtherParticipant(conversation, currentUserId)),
    lastMessage,
    unreadCount,
    updatedAt: conversation.updatedAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
  };
}

async function getConversationForUser(
  userId: string,
  conversationId: string,
): Promise<ConversationWithRelations> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      deletedAt: null,
      participants: {
        some: { userId, deletedAt: null },
      },
    },
    include: conversationInclude,
  });

  if (!conversation) throw errors.notFound('Conversation not found');
  return conversation;
}

export async function contactSeller(
  decoded: DecodedIdToken,
  postId: string,
): Promise<ConversationResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const post = await prisma.communityPost.findFirst({
    where: { id: postId, deletedAt: null },
    include: { author: true },
  });

  if (!post) throw errors.notFound('Post not found');
  if (post.type !== CommunityPostType.MARKETPLACE) {
    throw errors.badRequest('Messaging is only available for marketplace posts');
  }
  if (post.authorId === user.id) {
    throw errors.badRequest('You cannot message yourself about your own listing');
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      communityPostId: postId,
      initiatorId: user.id,
      deletedAt: null,
    },
    include: conversationInclude,
  });

  if (existing) {
    return toConversationResponse(existing, user.id);
  }

  const created = await prisma.conversation.create({
    data: {
      type: ConversationType.MARKETPLACE,
      communityPostId: postId,
      initiatorId: user.id,
      participants: {
        create: [{ userId: user.id }, { userId: post.authorId }],
      },
    },
    include: conversationInclude,
  });

  return toConversationResponse(created, user.id);
}

export async function listConversations(
  decoded: DecodedIdToken,
  query: ConversationListQuery,
): Promise<ConversationListResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const where: Prisma.ConversationWhereInput = {
    deletedAt: null,
    participants: { some: { userId: user.id, deletedAt: null } },
  };

  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: query.limit,
    }),
  ]);

  const conversations = await Promise.all(
    rows.map((row) => toConversationResponse(row, user.id)),
  );

  const meta: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit) || 1,
  };

  return { conversations, meta };
}

export async function getConversation(
  decoded: DecodedIdToken,
  conversationId: string,
): Promise<ConversationResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const conversation = await getConversationForUser(user.id, conversationId);
  return toConversationResponse(conversation, user.id);
}

export async function listMessages(
  decoded: DecodedIdToken,
  conversationId: string,
  query: MessageHistoryQuery,
): Promise<MessageListResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  await getConversationForUser(user.id, conversationId);

  const take = query.limit + 1;
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(query.cursor ? { createdAt: { lt: new Date(query.cursor) } } : {}),
    },
    include: { sender: true },
    orderBy: { createdAt: 'desc' },
    take,
  });

  const hasMore = rows.length > query.limit;
  const messages = rows.slice(0, query.limit).reverse().map(toMessageResponse);

  return { messages, hasMore };
}

export async function sendMessage(
  decoded: DecodedIdToken,
  conversationId: string,
  body: SendMessageRequest,
): Promise<MessageResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const conversation = await getConversationForUser(user.id, conversationId);

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId,
        senderId: user.id,
        type: MessageType.TEXT,
        content: body.content,
      },
      include: { sender: true },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    await tx.conversationParticipant.updateMany({
      where: { conversationId, userId: user.id, deletedAt: null },
      data: { lastReadAt: new Date() },
    });

    return created;
  });

  const recipient = conversation.participants.find((p) => p.userId !== user.id);
  if (recipient) {
    const listingTitle = conversation.communityPost.title ?? 'your listing';
    const senderName = `${user.firstName} ${user.lastName}`.trim();
    const notificationTitle = 'New message';
    const notificationBody = `${senderName} sent a message about "${listingTitle}"`;

    await createInAppNotification({
      userId: recipient.userId,
      type: NotificationType.MARKETPLACE_MESSAGE,
      title: notificationTitle,
      body: notificationBody,
      referenceId: conversationId,
      referenceType: NotificationReferenceType.CONVERSATION,
    });

    await dispatchPush(recipient.userId, {
      title: notificationTitle,
      body: notificationBody,
      data: {
        type: 'MARKETPLACE_MESSAGE',
        conversationId,
        communityPostId: conversation.communityPostId,
        title: notificationTitle,
      },
    });
  }

  return toMessageResponse(message);
}

export async function markConversationRead(
  decoded: DecodedIdToken,
  conversationId: string,
): Promise<{ read: true }> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  await getConversationForUser(user.id, conversationId);

  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId: user.id, deletedAt: null },
    data: { lastReadAt: new Date() },
  });

  return { read: true };
}

export async function getUnreadMessageCount(
  decoded: DecodedIdToken,
): Promise<{ unreadCount: number }> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const participants = await prisma.conversationParticipant.findMany({
    where: { userId: user.id, deletedAt: null, conversation: { deletedAt: null } },
    select: { conversationId: true, lastReadAt: true },
  });

  let unreadCount = 0;
  for (const participant of participants) {
    unreadCount += await countUnread(
      participant.conversationId,
      user.id,
      participant.lastReadAt,
    );
  }

  return { unreadCount };
}
