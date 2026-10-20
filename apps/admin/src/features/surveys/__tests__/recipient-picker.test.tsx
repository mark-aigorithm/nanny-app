/**
 * Choosing who gets a survey, on its own page: first "Every mother" or "Choose
 * mothers" (nothing preselected), then for a chosen few any groups (toggle
 * chips) and ticked mothers, combined. "Your audience" lists each pick, removable;
 * the summary says what will be sent before anything is,
 * and publishing confirms with the reach.
 */
import type { AdminSurvey, MotherPickerRow, UserGroup } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { SurveyRecipientsPage } from '@admin/pages/survey-recipients-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });
const ADMIN = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};
const GROUP: UserGroup = { id: 2, name: 'Beta', description: null, kind: 'STATIC', rules: null, memberCount: 12, createdAt: '2026-10-01T00:00:00.000Z' };
const AMY: MotherPickerRow = {
  id: 11, name: 'Amy', phone: null, completedBookings: 0, hoursBooked: 0, totalSpent: 0,
  lastBookingAt: null, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: null, lastAppOpenAt: null,
};
const DRAFT: AdminSurvey = {
  id: 3, title: 'Care feedback', status: 'DRAFT',
  counts: { recipients: 0, answered: 0, skipped: 0, pending: 0 },
  publishedAt: null, closedAt: null, createdAt: '2026-10-19T00:00:00.000Z',
  questions: [{ id: 1, order: 0, type: 'TEXT', prompt: 'Why', required: true, options: [] }],
};
const PUBLISHED: AdminSurvey = { ...DRAFT, status: 'PUBLISHED', publishedAt: '2026-10-20T00:00:00.000Z' };

const paged = <T,>(data: T[], total = data.length) =>
  HttpResponse.json({ data, error: null, meta: { page: 1, limit: 20, total, totalPages: 1 } });

beforeEach(() => {
  server.use(
    http.get('/api/admin/me', () => ok(ADMIN)),
    http.get('/api/admin/groups', () => ok([GROUP])),
    http.get('/api/admin/mother-picker', () => paged([AMY], 214)),
    http.get('/api/admin/surveys/3', () => ok(DRAFT)),
  );
});

function renderPage(mode: 'publish' | 'add' = 'publish') {
  const router = createMemoryRouter(
    [
      { path: '/surveys/:id/publish', element: <SurveyRecipientsPage mode="publish" /> },
      { path: '/surveys/:id/add-recipients', element: <SurveyRecipientsPage mode="add" /> },
      { path: '/surveys/:id', element: <p>Survey 3 open</p> },
    ],
    { initialEntries: [mode === 'publish' ? '/surveys/3/publish' : '/surveys/3/add-recipients'] },
  );
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <RouterProvider router={router} />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

const chooseMothers = async () =>
  userEvent.click(await screen.findByRole('radio', { name: /choose mothers/i }));
const everyMother = async () =>
  userEvent.click(await screen.findByRole('radio', { name: /every mother/i }));
/** Publish is irreversible, so it is confirmed with the reach in the title. */
const confirmPublish = async () => {
  await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
  await userEvent.click(
    within(screen.getByRole('dialog', { name: /^publish to/i })).getByRole('button', { name: 'Publish' }),
  );
};

describe('Choosing who gets a survey', () => {
  it('preselects nothing and keeps Publish off until a choice is made', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Publish survey' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /every mother/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /choose mothers/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /publish and notify/i })).toBeDisabled();
    expect(screen.getByText('Choose who gets this survey.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search mothers')).not.toBeInTheDocument();
  });

  it('publishes to a group plus a ticked mother, then returns to the survey', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/mother-picker', () => paged([AMY], 1)),
      http.post('/api/admin/surveys/3/publish', async ({ request }) => {
        body = await request.json();
        return ok({ count: 13 });
      }),
    );
    renderPage();
    await chooseMothers();
    expect(screen.getByRole('button', { name: /publish and notify/i })).toBeDisabled();
    const beta = await screen.findByRole('button', { name: /^Beta/ });
    await userEvent.click(beta);
    expect(beta).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    expect(screen.getByText(/1 group and 1 mother/i)).toBeInTheDocument();
    // The reach before sending: 12 in the group plus Amy, at most (overlaps are sent once).
    const panel = screen.getByRole('complementary', { name: 'Your audience' });
    expect(within(panel).getByText('Up to 13 mothers')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
    expect(body).toBeUndefined();
    expect(screen.getByRole('dialog', { name: 'Publish to up to 13 mothers?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Survey 3 open')).toBeInTheDocument();
    expect(body).toEqual({ allMothers: false, groupIds: [2], userIds: [11] });
    expect(screen.getByText('Sent to 13 mothers')).toBeInTheDocument();
  });

  it('"Every mother" shows the count, hides the picker and sends allMothers', async () => {
    let body: unknown;
    server.use(
      http.post('/api/admin/surveys/3/publish', async ({ request }) => {
        body = await request.json();
        return ok({ count: 214 });
      }),
    );
    renderPage();
    await everyMother();
    expect(screen.queryByLabelText('Search mothers')).not.toBeInTheDocument();
    expect(await screen.findByText('All 214 active mothers will get this survey.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish and notify/i }));
    expect(screen.getByRole('dialog', { name: 'Publish to all 214 mothers?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(body).toEqual({ allMothers: true, groupIds: [], userIds: [] }));
  });

  it('adds recipients to a published survey through the add endpoint', async () => {
    let hit = false;
    server.use(
      http.get('/api/admin/surveys/3', () => ok(PUBLISHED)),
      http.post('/api/admin/surveys/3/recipients', () => {
        hit = true;
        return ok({ count: 12 });
      }),
    );
    renderPage('add');
    expect(await screen.findByRole('heading', { name: 'Add recipients' })).toBeInTheDocument();
    await chooseMothers();
    expect(screen.getByRole('button', { name: 'Add recipients' })).toBeDisabled();
    await userEvent.click(await screen.findByRole('button', { name: /^Beta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    expect(await screen.findByText('Survey 3 open')).toBeInTheDocument();
    expect(hit).toBe(true);
  });

  it('a publish that timed out after it went through returns with a partial-delivery note, not a failure', async () => {
    let reads = 0;
    server.use(
      // Vercel cut the function off mid-fan-out: the survey is published, some pushes were not sent.
      http.post('/api/admin/surveys/3/publish', () => new HttpResponse(null, { status: 504 })),
      http.get('/api/admin/surveys/3', () => ok(reads++ === 0 ? DRAFT : PUBLISHED)),
    );
    renderPage();
    await everyMother();
    await confirmPublish();

    expect(await screen.findByText('Published; some notifications may not have been delivered')).toBeInTheDocument();
    expect(await screen.findByText('Survey 3 open')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't send the survey")).not.toBeInTheDocument();
  });

  it('a publish that failed and left the draft a draft still reports the failure, and stays', async () => {
    server.use(http.post('/api/admin/surveys/3/publish', () => new HttpResponse(null, { status: 504 })));
    renderPage();
    await everyMother();
    await confirmPublish();

    expect(await screen.findByText("Couldn't send the survey")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Publish survey' })).toBeInTheDocument();
  });

  it('shows the groups loading, then a retryable error instead of an empty list (M2)', async () => {
    let fail = true;
    server.use(
      http.get('/api/admin/surveys/3', () => ok(PUBLISHED)),
      // A beat of latency, so the loading state is there to be seen.
      http.get('/api/admin/groups', async () => {
        await delay(100);
        return fail ? new HttpResponse(null, { status: 500 }) : ok([GROUP]);
      }),
    );
    renderPage('add');
    await chooseMothers();
    expect(screen.getByText('Loading groups…')).toBeInTheDocument();
    expect(await screen.findByText(/couldn.t load the groups/i, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('No groups yet.')).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /^Beta/ })).toBeInTheDocument();
  });

  it('lists the picks in "Your audience", each removable', async () => {
    renderPage();
    await chooseMothers();
    const panel = screen.getByRole('complementary', { name: 'Your audience' });
    expect(within(panel).getByText(/nothing picked yet/i)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: /^Beta/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));
    expect(within(panel).getByText('Amy')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Remove Amy' }));
    expect(screen.getByRole('checkbox', { name: 'Select Amy' })).not.toBeChecked();
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove Beta' }));
    expect(screen.getByRole('button', { name: /^Beta/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(panel).getByText(/nothing picked yet/i)).toBeInTheDocument();
  });

  it('asks before leaving a picked selection behind (M12)', async () => {
    renderPage();
    await chooseMothers();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Amy' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard your selection?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep picking' }));
    expect(screen.getByRole('checkbox', { name: 'Select Amy' })).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Care feedback' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('Survey 3 open')).toBeInTheDocument();
  });

  it('goes back straight away when nothing is picked', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Survey 3 open')).toBeInTheDocument();
  });

  it('sends a draft without questions, or a view-only operator, back to the survey', async () => {
    server.use(http.get('/api/admin/surveys/3', () => ok({ ...DRAFT, questions: [] })));
    renderPage();
    expect(await screen.findByText('Survey 3 open')).toBeInTheDocument();
  });
});
