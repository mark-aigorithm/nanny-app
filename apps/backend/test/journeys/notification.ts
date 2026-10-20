import type { NotificationBroadcast, NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseMessaging } from '@backend/lib/firebase';

import { authHeader } from '../auth';

/** A plain announcement to the given audience; override only what the test is about. */
export function templateInput(
  audience: NotificationTemplateInput['audience'],
  overrides: Partial<NotificationTemplateInput> = {},
): NotificationTemplateInput {
  return {
    name: 'Win-back 30d',
    title: 'We miss you',
    body: 'Book a nanny this week and save 20%.',
    imageUrl: null,
    channel: 'BOTH',
    targetType: null,
    packageId: null,
    promoCodeId: null,
    audience,
    ...overrides,
  };
}

export async function createTemplate(
  adminToken: string,
  input: NotificationTemplateInput,
): Promise<NotificationTemplate> {
  const res = await request(app)
    .post('/admin/notification-templates')
    .set(...authHeader(adminToken))
    .send(input);
  expect(res.status).toBe(201);
  return res.body.data as NotificationTemplate;
}

/** `device_tokens.token` is unique; the pid keeps it so across workers. */
let tokenSeq = 0;

/** Registers a live push device for the user and returns its FCM token. */
export async function giveDevice(userId: number): Promise<string> {
  tokenSeq += 1;
  const token = `fcm-${process.pid}-${tokenSeq}`;
  await prisma.deviceToken.create({ data: { userId, token, platform: 'ANDROID' } });
  return token;
}

export async function publishTemplate(adminToken: string, templateId: number): Promise<NotificationBroadcast> {
  const res = await request(app)
    .post(`/admin/notification-templates/${templateId}/publish`)
    .set(...authHeader(adminToken));
  expect(res.status).toBe(201);
  return res.body.data as NotificationBroadcast;
}

/** FCM's answer when every token in the multicast took the message. */
export function deliverAll(message: MulticastMessage): BatchResponse {
  return {
    successCount: message.tokens.length,
    failureCount: 0,
    responses: message.tokens.map(() => ({ success: true, messageId: 'test-message' })),
  };
}

/**
 * Stands in for FCM. Integration runs have no FCM credentials (the Admin SDK
 * is initialised for the Auth emulator only), so a real send would fail every
 * batch; the spy also records exactly what was sent. Undo with
 * `jest.restoreAllMocks()`.
 */
export function spyOnPush() {
  return jest
    .spyOn(firebaseMessaging, 'sendEachForMulticast')
    .mockImplementation(async (message) => deliverAll(message));
}
