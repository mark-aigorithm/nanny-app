/**
 * The table now carries every post type. What is worth pinning: a Q&A post
 * with no headline is still identifiable (by its question), an event shows
 * where and when, the decision goes to the community endpoint, and a live
 * post's menu says "Take down" rather than "Reject". An official listing is
 * edited through the same modal the page header's "Add official listing"
 * opens, and the list is sorted by the API, so the page sends the sort.
 */
import type { AdminCommunityPost, AdminUser } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PostTable } from '@admin/features/community/post-table';
import { CommunityPage } from '@admin/pages/community-page';
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

const OFFICIAL: AdminCommunityPost = {
  ...BASE,
  id: 47,
  title: 'Convertible car seat',
  body: 'Brand new, sealed box',
  price: 3500,
  imageUrls: ['https://cdn.example.com/seat.jpg'],
  moderationStatus: 'approved',
  isOfficial: true,
  contactPhone: '+201001234567',
  author: { id: 1, name: 'Ops Admin', avatarUrl: null },
};

const OFFICIAL_EVENT: AdminCommunityPost = {
  ...BASE,
  id: 52,
  type: 'event',
  title: 'Mommy & me picnic',
  body: null,
  price: 100,
  imageUrls: [],
  location: 'Merryland Park',
  // 09:00 UTC is 11:00 in Cairo in January.
  eventStartsAt: '2026-01-15T09:00:00.000Z',
  maxAttendees: 20,
  moderationStatus: 'approved',
  isOfficial: true,
};

function renderTable(
  posts: AdminCommunityPost[],
  sortProps: Pick<Parameters<typeof PostTable>[0], 'sort' | 'onSortChange'> = {},
) {
  server.use(http.get('/api/admin/me', () => ok(ADMIN)));
  return renderWithProviders(
    <PermissionsProvider>
      <ToastProvider>
        <PostTable posts={posts} {...sortProps} />
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

  it('edits an official listing in the shared modal, never reviewing it', async () => {
    let body: unknown = null;
    server.use(
      http.patch('/api/admin/community/official-posts/:id', async ({ params, request }) => {
        body = { id: String(params['id']), ...((await request.json()) as object) };
        return ok({ ...OFFICIAL, price: 3200 });
      }),
    );
    renderTable([OFFICIAL]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Convertible car seat' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Approve' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Product name')).toHaveValue('Convertible car seat');
    const price = within(dialog).getByLabelText('Price (EGP)');
    await userEvent.clear(price);
    await userEvent.type(price, '3200');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(body).toEqual({
        id: '47',
        title: 'Convertible car seat',
        body: 'Brand new, sealed box',
        price: 3200,
        imageUrls: ['https://cdn.example.com/seat.jpg'],
        tags: [],
        contactPhone: '+201001234567',
      }),
    );
    expect(await screen.findByText('Listing updated')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edits an official event, making it free and uncapped', async () => {
    let body: unknown = null;
    server.use(
      http.patch('/api/admin/community/official-posts/:id', async ({ request }) => {
        body = await request.json();
        return ok({ ...OFFICIAL_EVENT, price: null, maxAttendees: null });
      }),
    );
    renderTable([OFFICIAL_EVENT]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Mommy & me picnic' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog', { name: 'Edit official event' });
    expect(within(dialog).getByLabelText('Date and time')).toHaveValue('2026-01-15T11:00');
    await userEvent.clear(within(dialog).getByLabelText(/Price \(EGP\)/));
    await userEvent.clear(within(dialog).getByLabelText(/Max attendees/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(body).toEqual({
        title: 'Mommy & me picnic',
        body: null,
        eventStartsAt: '2026-01-15T11:00:00',
        location: 'Merryland Park',
        price: null,
        maxAttendees: null,
        imageUrls: [],
        tags: [],
      }),
    );
    expect(await screen.findByText('Event updated')).toBeInTheDocument();
  });

  it('deletes an official event by name', async () => {
    let deleted: string | null = null;
    server.use(
      http.delete('/api/admin/community/official-posts/:id', ({ params }) => {
        deleted = String(params['id']);
        return ok({ deleted: true });
      }),
    );
    renderTable([OFFICIAL_EVENT]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Mommy & me picnic' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete event' }));

    await waitFor(() => expect(deleted).toBe('52'));
    expect(await screen.findByText('Official event deleted')).toBeInTheDocument();
  });

  it('reports a header click as a server sort, dates newest first', async () => {
    const onSortChange = vi.fn();
    renderTable([BASE], { sort: { sortBy: 'submitted', sortDir: 'asc' }, onSortChange });

    await userEvent.click(await screen.findByRole('button', { name: /Author/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'author', sortDir: 'asc' });
  });
});

describe('CommunityPage', () => {
  function renderPage() {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/community/posts', ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: [BASE],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
          error: null,
        });
      }),
    );
    renderWithProviders(
      <PermissionsProvider>
        <ToastProvider>
          <CommunityPage />
        </ToastProvider>
      </PermissionsProvider>,
    );
    return queries;
  }

  it('opens the pending queue oldest first and re-sorts on the server', async () => {
    const queries = renderPage();

    await screen.findByText('Stroller');
    expect(queries.at(-1)?.get('sortBy')).toBe('submitted');
    expect(queries.at(-1)?.get('sortDir')).toBe('asc');

    await userEvent.click(screen.getByRole('button', { name: /Submitted/ }));
    await waitFor(() => expect(queries.at(-1)?.get('sortDir')).toBe('desc'));
  });

  it('adds an official listing from the header, checking it before it posts', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Add official listing' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Product name'), 'Car seat');
    await userEvent.type(within(dialog).getByLabelText('Price (EGP)'), '3500');
    await userEvent.type(within(dialog).getByLabelText(/Contact number/), '+201001234567');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish listing' }));

    // No photo yet — caught by the shared schema before any request is made.
    expect(await within(dialog).findByText(/At least one image is required/)).toBeInTheDocument();
  });
});
