/**
 * The table now carries every post type. What is worth pinning: a Q&A post
 * with no headline is still identifiable (by its question), an event shows
 * where and when, the decision goes to the community endpoint, and a live
 * post's menu says "Take down" rather than "Reject".
 */
import type { AdminCommunityPost, AdminUser } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PostTable } from '@admin/features/community/post-table';
import { PermissionsProvider } from '@admin/lib/permissions';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const ADMIN: AdminUser = {
  id: 1,
  name: 'Ops Admin',
  email: 'ops@example.com',
  role: 'ADMIN',
  permissions: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const BASE: AdminCommunityPost = {
  id: 44,
  type: 'marketplace',
  title: 'Stroller',
  body: 'Barely used',
  price: 1200,
  imageUrls: [],
  tags: [],
  location: null,
  eventStartsAt: null,
  maxAttendees: null,
  rsvpCount: 0,
  moderationStatus: 'pending',
  rejectionReason: null,
  reviewedAt: null,
  isOfficial: false,
  contactPhone: null,
  author: { id: 29, name: 'Jane Doe', avatarUrl: null },
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

const QA: AdminCommunityPost = {
  ...BASE,
  id: 46,
  type: 'qa',
  title: null,
  body: 'Where do I buy a pram in Cairo?',
  price: null,
};

const EVENT: AdminCommunityPost = {
  ...BASE,
  id: 45,
  type: 'event',
  title: 'Coffee morning',
  location: 'Maadi Community Hall',
  eventStartsAt: '2026-10-01T09:00:00.000Z',
  price: null,
};

function renderTable(posts: AdminCommunityPost[]) {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)));
  return renderWithProviders(
    <PermissionsProvider>
      <ToastProvider>
        <PostTable posts={posts} />
      </ToastProvider>
    </PermissionsProvider>,
  );
}

describe('PostTable', () => {
  it('names a Q&A post by its question and shows an event’s place', async () => {
    renderTable([QA, EVENT]);

    expect(await screen.findByText('Where do I buy a pram in Cairo?')).toBeInTheDocument();
    expect(screen.getByText('Q&A')).toBeInTheDocument();
    expect(screen.getByText('Maadi Community Hall')).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
  });

  it('approves through the community endpoint', async () => {
    let approvedId: string | null = null;
    server.use(
      http.post('/api/admin/community/posts/:id/approve', ({ params }) => {
        approvedId = String(params['id']);
        return ok({ ...EVENT, moderationStatus: 'approved' });
      }),
    );
    renderTable([EVENT]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Coffee morning' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Approve' }));

    await waitFor(() => expect(approvedId).toBe('45'));
    expect(await screen.findByText('Post approved')).toBeInTheDocument();
  });

  it('offers Take down on a live post and sends the reason', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/community/posts/:id/reject', async ({ request }) => {
        body = await request.json();
        return ok({ ...QA, moderationStatus: 'rejected', rejectionReason: 'Off topic' });
      }),
    );
    renderTable([{ ...QA, moderationStatus: 'approved' }]);

    await userEvent.click(await screen.findByRole('button', { name: /Actions for/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Take down' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Off topic');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Take down' }));

    await waitFor(() => expect(body).toEqual({ reason: 'Off topic' }));
    expect(await screen.findByText('Post rejected')).toBeInTheDocument();
  });
});
