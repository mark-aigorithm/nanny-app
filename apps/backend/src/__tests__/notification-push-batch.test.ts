/**
 * The broadcast push sender: FCM multicast in batches of 500 tokens, at most 4
 * batches in flight, dead tokens soft-deleted with the same error-code check as
 * the per-user dispatchPush, and an exact sent/failed tally — including a batch
 * whose whole call throws.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { deviceToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseMessaging: { sendEachForMulticast: jest.fn() },
}));

import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';

import { prisma } from '@backend/db/prisma';
import { firebaseMessaging } from '@backend/lib/firebase';
import { dispatchPushToTokens } from '@backend/services/notification.service';

const send = firebaseMessaging.sendEachForMulticast as unknown as jest.Mock<
  Promise<BatchResponse>,
  [MulticastMessage]
>;
const updateMany = prisma.deviceToken.updateMany as unknown as jest.Mock;

const MESSAGE = {
  title: 'We miss you',
  body: 'Book this week and save 20%.',
  data: { type: 'ANNOUNCEMENT', broadcastId: '7' },
};
const IMAGE = 'https://cdn.example.com/notifications/win-back.jpg';

const tokens = (n: number): string[] => Array.from({ length: n }, (_, i) => `tok-${i}`);

function deliverAll(message: MulticastMessage): BatchResponse {
  return {
    successCount: message.tokens.length,
    failureCount: 0,
    responses: message.tokens.map(() => ({ success: true, messageId: 'm' })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  send.mockImplementation(async (message) => deliverAll(message));
});

describe('dispatchPushToTokens', () => {
  it('sends 1,201 tokens as three multicasts of 500, 500 and 201', async () => {
    const result = await dispatchPushToTokens(tokens(1201), MESSAGE);

    expect(send.mock.calls.map(([message]) => message.tokens.length)).toEqual([500, 500, 201]);
    expect(send.mock.calls.flatMap(([message]) => message.tokens)).toEqual(tokens(1201));
    expect(result).toEqual({ sent: 1201, failed: 0 });
  });

  it('keeps at most 4 batches in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    send.mockImplementation(async (message) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return deliverAll(message);
    });

    const result = await dispatchPushToTokens(tokens(5000), MESSAGE);

    expect(send).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
    expect(result).toEqual({ sent: 5000, failed: 0 });
  });

  it('puts the image on the notification and on the Android notification', async () => {
    await dispatchPushToTokens(['a'], { ...MESSAGE, imageUrl: IMAGE });

    expect(send).toHaveBeenCalledWith({
      tokens: ['a'],
      notification: { title: MESSAGE.title, body: MESSAGE.body, imageUrl: IMAGE },
      android: { notification: { imageUrl: IMAGE } },
      data: MESSAGE.data,
    });
  });

  it('sends no imageUrl and no android block without an image', async () => {
    await dispatchPushToTokens(['a'], { ...MESSAGE, imageUrl: null });

    const [message] = send.mock.calls[0]!;
    expect(message.notification).toEqual({ title: MESSAGE.title, body: MESSAGE.body });
    expect(message.android).toBeUndefined();
  });

  it('soft-deletes dead tokens and counts every failure', async () => {
    send.mockImplementationOnce(async () => {
      const response = {
        successCount: 1,
        failureCount: 3,
        responses: [
          { success: true, messageId: 'm' },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: false, error: { code: 'messaging/invalid-registration-token' } },
          { success: false, error: { code: 'messaging/internal-error' } },
        ],
      };
      return response as unknown as BatchResponse;
    });

    const result = await dispatchPushToTokens(['ok', 'gone', 'bad', 'flaky'], MESSAGE);

    expect(result).toEqual({ sent: 1, failed: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { token: { in: ['gone', 'bad'] }, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('counts a batch whose call throws as failed and still sends the others', async () => {
    send.mockRejectedValueOnce(new Error('FCM unavailable'));

    const result = await dispatchPushToTokens(tokens(700), MESSAGE);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 200, failed: 500 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('sends each token once and nothing for an empty list', async () => {
    await dispatchPushToTokens(['a', 'b', 'a'], MESSAGE);
    expect(send.mock.calls[0]![0].tokens).toEqual(['a', 'b']);

    send.mockClear();
    expect(await dispatchPushToTokens([], MESSAGE)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
