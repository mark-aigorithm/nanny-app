import { Role } from '@nanny-app/shared';
import {
  CommunityPostType,
  ConversationType,
  MessageType,
} from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import {
  contactSeller,
  getUnreadMessageCount,
  listConversations,
  sendMessage,
} from '@backend/services/conversation.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    communityPost: { findFirst: jest.fn() },
    conversation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    conversationParticipant: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    message: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  communityPost: { findFirst: jest.Mock };
  conversation: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
  };
  conversationParticipant: { findMany: jest.Mock };
  message: { count: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const buyer = {
  id: 5,
  firebaseUid: 'firebase-buyer',
  role: Role.MOTHER,
  deletedAt: null,
  firstName: 'Jane',
  lastName: 'Buyer',
  avatarUrl: null,
};

const seller = {
  id: 25,
  firebaseUid: 'firebase-seller',
  role: Role.MOTHER,
  deletedAt: null,
  firstName: 'Sara',
  lastName: 'Seller',
  avatarUrl: null,
};

const marketplacePost = {
  id: 22,
  authorId: seller.id,
  type: CommunityPostType.MARKETPLACE,
  title: 'Stroller',
  body: 'Gently used',
  imageUrls: ['https://example.com/stroller.jpg'],
  price: { toString: () => '2500' },
  deletedAt: null,
  author: seller,
};

const decoded = { uid: 'firebase-buyer' } as import('@backend/lib/firebase').DecodedIdToken;

const sampleConversation = {
  id: 8,
  type: ConversationType.MARKETPLACE,
  communityPostId: 22,
  initiatorId: buyer.id,
  createdAt: new Date('2026-01-01T12:00:00Z'),
  updatedAt: new Date('2026-01-01T12:00:00Z'),
  deletedAt: null,
  communityPost: marketplacePost,
  participants: [
    { userId: buyer.id, lastReadAt: null, user: buyer },
    { userId: seller.id, lastReadAt: null, user: seller },
  ],
  messages: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(buyer as never);
  mockPrisma.message.count.mockResolvedValue(0);
});

describe('conversation.service', () => {
  it('forbids non-mothers from contacting seller', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...buyer,
      role: Role.NANNY,
    } as never);

    await expect(contactSeller(decoded, 22)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 403 }),
    );
  });

  it('rejects contacting seller on own listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue({
      ...marketplacePost,
      authorId: buyer.id,
      author: buyer,
    } as never);

    await expect(contactSeller(decoded, 22)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
    );
  });

  it('returns existing conversation when buyer already contacted seller', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(marketplacePost as never);
    mockPrisma.conversation.findFirst.mockResolvedValue(sampleConversation as never);

    const result = await contactSeller(decoded, 22);

    expect(result.id).toBe(8);
    expect(result.listingContext.title).toBe('Stroller');
    expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
  });

  it('creates a new marketplace conversation', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(marketplacePost as never);
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue(sampleConversation as never);

    const result = await contactSeller(decoded, 22);

    expect(result.otherParticipant.id).toBe(25);
    expect(mockPrisma.conversation.create).toHaveBeenCalled();
  });

  it('lists conversations with pagination meta', async () => {
    mockPrisma.conversation.count.mockResolvedValue(1);
    mockPrisma.conversation.findMany.mockResolvedValue([sampleConversation] as never);

    const result = await listConversations(decoded, { page: 1, limit: 20 });

    expect(result.conversations).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('sends a text message and updates conversation', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(sampleConversation as never);
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        message: {
          create: jest.fn().mockResolvedValue({
            id: 11,
            conversationId: 8,
            type: MessageType.TEXT,
            content: 'Hello',
            createdAt: new Date('2026-01-01T12:05:00Z'),
            sender: buyer,
          }),
        },
        conversation: { update: jest.fn() },
        conversationParticipant: { updateMany: jest.fn() },
      };
      return fn(tx as never);
    });

    const result = await sendMessage(decoded, 8, { content: 'Hello' });

    expect(result.content).toBe('Hello');
    expect(result.sender.id).toBe(5);
  });

  const mockSendTransaction = () =>
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        message: {
          create: jest.fn().mockResolvedValue({
            id: 11,
            conversationId: 8,
            type: MessageType.TEXT,
            content: 'Hello',
            createdAt: new Date('2026-01-01T12:05:00Z'),
            sender: buyer,
          }),
        },
        conversation: { update: jest.fn() },
        conversationParticipant: { updateMany: jest.fn() },
      };
      return fn(tx as never);
    });

  it('notifies a mother recipient when a message is sent', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(sampleConversation as never);
    mockSendTransaction();

    await sendMessage(decoded, 8, { content: 'Hello' });

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('does not notify a nanny recipient when a message is sent', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({
      ...sampleConversation,
      participants: [
        { userId: buyer.id, lastReadAt: null, user: buyer },
        { userId: seller.id, lastReadAt: null, user: { ...seller, role: Role.NANNY } },
      ],
    } as never);
    mockSendTransaction();

    await sendMessage(decoded, 8, { content: 'Hello' });

    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns total unread message count', async () => {
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 8, lastReadAt: null },
    ] as never);
    mockPrisma.message.count.mockResolvedValue(2);

    const result = await getUnreadMessageCount(decoded);

    expect(result.unreadCount).toBe(2);
  });
});
