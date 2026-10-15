/**
 * A33 — mother and nanny chat on a running booking; the console reads it.
 *
 * Sending is open only while the booking is IN_PROGRESS. Reading follows the
 * booking's current nanny, so a nanny reassigned off it loses the chat, and an
 * outsider can't tell the booking exists.
 */
import request from 'supertest';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeBooking, makeMother, makeNanny } from '../../../test/factories';

async function setUp(status: 'IN_PROGRESS' | 'CONFIRMED' | 'COMPLETED' = 'IN_PROGRESS') {
  const mother = await makeMother();
  const nanny = await makeNanny();
  const booking = await makeBooking({
    motherId: mother.id,
    nannyProfileId: nanny.nannyProfileId,
    status,
  });
  return { mother, nanny, booking };
}

async function waitForNotification(userId: number) {
  for (let i = 0; i < 20; i++) {
    const note = await prisma.notification.findFirst({ where: { userId, type: 'BOOKING_MESSAGE' } });
    if (note) return note;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

describe('A33 — booking chat', () => {
  it('lets them talk during the shift, with unread counts and a notification', async () => {
    const { mother, nanny, booking } = await setUp();

    const sent = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: '  Nap at 1pm please  ' });
    expect(sent.status).toBe(201);
    expect(sent.body.data.content).toBe('Nap at 1pm please');
    expect(sent.body.data.sender.role).toBe('MOTHER');

    const note = await waitForNotification(nanny.id);
    expect(note?.referenceId).toBe(booking.id);
    expect(note?.body).toMatch(/: Nap at 1pm please$/);

    const before = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(nanny.token));
    expect(before.body.data).toEqual({ canSend: true, messageCount: 1, unreadCount: 1 });

    const reply = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(nanny.token))
      .send({ content: 'Will do' });
    expect(reply.body.data.sender.role).toBe('NANNY');

    // Replying marks her own side read.
    const after = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(nanny.token));
    expect(after.body.data.unreadCount).toBe(0);

    const motherSummary = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(mother.token));
    expect(motherSummary.body.data.unreadCount).toBe(1);

    await request(app)
      .post(`/bookings/${booking.id}/messages/read`)
      .set(...authHeader(mother.token))
      .expect(200);
    const read = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(mother.token));
    expect(read.body.data.unreadCount).toBe(0);

    const thread = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token));
    expect(thread.body.data.messages.map((m: { content: string }) => m.content)).toEqual([
      'Nap at 1pm please',
      'Will do',
    ]);
    expect(thread.body.data.hasMore).toBe(false);
  });

  it('pages back through older messages', async () => {
    const { mother, booking } = await setUp();
    for (const content of ['one', 'two', 'three']) {
      await request(app)
        .post(`/bookings/${booking.id}/messages`)
        .set(...authHeader(mother.token))
        .send({ content });
    }

    const latest = await request(app)
      .get(`/bookings/${booking.id}/messages?limit=2`)
      .set(...authHeader(mother.token));
    expect(latest.body.data.messages.map((m: { content: string }) => m.content)).toEqual(['two', 'three']);
    expect(latest.body.data.hasMore).toBe(true);

    const cursor = latest.body.data.messages[0].createdAt;
    const older = await request(app)
      .get(`/bookings/${booking.id}/messages?limit=2&cursor=${encodeURIComponent(cursor)}`)
      .set(...authHeader(mother.token));
    expect(older.body.data.messages.map((m: { content: string }) => m.content)).toEqual(['one']);
    expect(older.body.data.hasMore).toBe(false);
  });

  it('refuses to send outside the shift but still shows the history', async () => {
    const { mother, booking } = await setUp('IN_PROGRESS');
    await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: 'before it ended' });
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });

    const res = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: 'too late' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Messages can only be sent while the booking is in progress.');

    const summary = await request(app)
      .get(`/bookings/${booking.id}/messages/summary`)
      .set(...authHeader(mother.token));
    expect(summary.body.data).toMatchObject({ canSend: false, messageCount: 1 });
  });

  it('refuses before the shift starts', async () => {
    const { nanny, booking } = await setUp('CONFIRMED');
    const res = await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(nanny.token))
      .send({ content: 'On my way' });
    expect(res.status).toBe(409);
  });

  it('rejects an empty or oversize message without storing it', async () => {
    const { mother, booking } = await setUp();
    for (const content of ['   ', 'a'.repeat(2001)]) {
      const res = await request(app)
        .post(`/bookings/${booking.id}/messages`)
        .set(...authHeader(mother.token))
        .send({ content });
      expect(res.status).toBe(400);
    }
    expect(await prisma.bookingMessage.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it('hides the chat from an outsider and from a nanny reassigned off the booking', async () => {
    const { mother, nanny, booking } = await setUp();
    await request(app)
      .post(`/bookings/${booking.id}/messages`)
      .set(...authHeader(mother.token))
      .send({ content: 'hello' });

    const outsider = await makeMother();
    const peek = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(outsider.token));
    expect(peek.status).toBe(404);

    const replacement = await makeNanny();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { nannyProfileId: replacement.nannyProfileId },
    });

    const old = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(nanny.token));
    expect(old.status).toBe(404);

    const current = await request(app)
      .get(`/bookings/${booking.id}/messages`)
      .set(...authHeader(replacement.token));
    expect(current.body.data.messages).toHaveLength(1);
  });

  it('lets the console read the transcript', async () => {
    const { mother, nanny, booking } = await setUp();
    await request(app).post(`/bookings/${booking.id}/messages`).set(...authHeader(mother.token)).send({ content: 'hi' });
    await request(app).post(`/bookings/${booking.id}/messages`).set(...authHeader(nanny.token)).send({ content: 'hello' });

    const admin = await makeAdmin();
    const res = await request(app)
      .get(`/admin/bookings/${booking.id}/messages`)
      .set(...authHeader(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.messages.map((m: { sender: { role: string } }) => m.sender.role)).toEqual([
      'MOTHER',
      'NANNY',
    ]);

    // The console has no way to post.
    const post = await request(app)
      .post(`/admin/bookings/${booking.id}/messages`)
      .set(...authHeader(admin.token))
      .send({ content: 'x' });
    expect(post.status).not.toBe(201);
  });
});
