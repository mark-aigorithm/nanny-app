import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

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
