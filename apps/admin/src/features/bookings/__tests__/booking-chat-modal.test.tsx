/**
 * The console reads a booking's chat and cannot post in it. Each message says
 * who sent it and when; the mother sits left, the nanny right.
 */
import type { BookingMessageResponse } from '@nanny-app/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { BookingChatButton, BookingChatModal } from '@admin/features/bookings/booking-chat-modal';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const MESSAGES: BookingMessageResponse[] = [
  { id: 1, bookingId: 4, content: 'Nap at 1pm please', createdAt: '2026-10-15T10:00:00.000Z', sender: { id: 10, firstName: 'Jane', lastName: 'Mom', avatarUrl: null, role: 'MOTHER' } },
  { id: 2, bookingId: 4, content: 'Will do', createdAt: '2026-10-15T10:02:00.000Z', sender: { id: 23, firstName: 'Sara', lastName: 'Near', avatarUrl: null, role: 'NANNY' } },
];

describe('BookingChatModal', () => {
  it('shows each message with its sender, role and side, and no way to post', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: MESSAGES, hasMore: false })));
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName="Sara Near" onClose={vi.fn()} />,
    );

    expect(await screen.findByText('Nap at 1pm please')).toBeTruthy();
    const mine = screen.getByText('Nap at 1pm please').closest('.chat-msg');
    const hers = screen.getByText('Will do').closest('.chat-msg');
    expect(mine?.className).toContain('chat-msg--mother');
    expect(hers?.className).toContain('chat-msg--nanny');
    expect(screen.getByText('Jane Mom')).toBeTruthy();
    expect(screen.getAllByText('Mommy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nanny').length).toBeGreaterThan(0);
    expect(screen.getByText("Read-only — admins can't post in booking chats.")).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('says so when there are no messages', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: [], hasMore: false })));
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName={null} onClose={vi.fn()} />,
    );
    expect(await screen.findByText('No messages on this booking.')).toBeTruthy();
  });

  it('offers a retry when the transcript fails to load', async () => {
    server.use(
      http.get('/api/admin/bookings/4/messages', () =>
        HttpResponse.json({ data: null, error: 'Server exploded' }, { status: 500 }),
      ),
    );
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName={null} onClose={vi.fn()} />,
    );
    expect(await screen.findByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('closes on the close button', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: [], hasMore: false })));
    const onClose = vi.fn();
    renderWithProviders(
      <BookingChatModal bookingId="4" motherName="Jane Mom" nannyName={null} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BookingChatButton', () => {
  it('shows the count and opens', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: MESSAGES, hasMore: false })));
    const onOpen = vi.fn();
    renderWithProviders(<BookingChatButton bookingId="4" onOpen={onOpen} />);
    await userEvent.click(await screen.findByRole('button', { name: 'View chat (2)' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('is disabled with no messages', async () => {
    server.use(http.get('/api/admin/bookings/4/messages', () => ok({ messages: [], hasMore: false })));
    renderWithProviders(<BookingChatButton bookingId="4" onOpen={vi.fn()} />);
    const button = await screen.findByRole('button', { name: 'View chat (0)' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('No messages');
  });
});
