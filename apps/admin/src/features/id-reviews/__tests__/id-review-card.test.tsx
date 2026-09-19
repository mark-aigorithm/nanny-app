/**
 * The gallery decides a *parent's* ID. What is worth pinning is that the
 * card's decision goes to the mother endpoint — there is no role branch left
 * to pick the wrong one — and that the pair of buttons only shows while a
 * decision is still open.
 */
import type { AdminIdReview, AdminUser } from '@nanny-app/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { IdReviewCard } from '@admin/features/id-reviews/id-review-card';
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

const REVIEW: AdminIdReview = {
  id: 7,
  name: 'Nour Ibrahim',
  avatarUrl: null,
  location: 'Cairo',
  idDocumentType: 'PASSPORT',
  idDocumentFrontUrl: 'https://example.com/front.jpg',
  idDocumentBackUrl: null,
  approvalStatus: 'PENDING_REVIEW',
  rejectionReason: null,
  reviewedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function renderCard(review: AdminIdReview) {
  return renderWithProviders(
    <PermissionsProvider>
      <ToastProvider>
        <IdReviewCard review={review} />
      </ToastProvider>
    </PermissionsProvider>,
  );
}

describe('IdReviewCard', () => {
  it('approves through the mother endpoint', async () => {
    let approvedId: string | null = null;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.post('/api/admin/mothers/:id/approve', ({ params }) => {
        approvedId = String(params['id']);
        return ok({ ...REVIEW, approvalStatus: 'APPROVED' });
      }),
    );
    renderCard(REVIEW);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve ID' }));

    await waitFor(() => expect(approvedId).toBe('7'));
    expect(await screen.findByText('ID approved')).toBeInTheDocument();
  });

  it('offers no decision on an already-approved ID', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)));
    renderCard({ ...REVIEW, approvalStatus: 'APPROVED', reviewedAt: '2026-07-02T00:00:00.000Z' });

    expect(await screen.findByText('approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });
});
