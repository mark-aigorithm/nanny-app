/**
 * The admin is the only editor of a nanny's profile, so the form has to be
 * able to reach every field. Pinned here: the three fields the nanny cannot
 * touch from the app — photo, date of birth, home pin — are sent, and a pin
 * cannot half-move.
 */
import type { AdminNannyDetail, UpdateAdminNanny } from '@nanny-app/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { NannyProfileEditor } from '@admin/features/nannies/nanny-profile-editor';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

vi.mock('@admin/lib/storage', () => ({
  uploadImageToFirebase: vi.fn().mockResolvedValue('https://cdn.example/uploaded.jpg'),
}));

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

const NANNY: AdminNannyDetail = {
  id: 19,
  userId: 10,
  name: 'Amira Hassan',
  firstName: 'Amira',
  lastName: 'Hassan',
  email: 'amira@example.com',
  phone: '+201000000000',
  dateOfBirth: '1995-06-15',
  avatarUrl: null,
  bio: 'Loves kids',
  location: 'Cairo',
  latitude: 30.0444,
  longitude: 31.2357,
  yearsOfExperience: 4,
  certifications: [],
  skills: [],
  isEmailVerified: true,
  isPhoneVerified: false,
  approvalStatus: 'APPROVED',
  idDocumentType: null,
  rejectionReason: null,
  reviewedAt: null,
  idDocumentFrontUrl: null,
  idDocumentBackUrl: null,
  ageRanges: [],
  availabilityType: 'FULL_TIME',
  schedule: null,
  amountGained: 0,
  completedBookings: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function renderEditor() {
  return renderWithProviders(
    <ToastProvider>
      <NannyProfileEditor nanny={NANNY} certifications={[]} onDone={() => {}} />
    </ToastProvider>,
  );
}

describe('NannyProfileEditor', () => {
  it('sends photo, date of birth and home pin', async () => {
    let body: UpdateAdminNanny | null = null;
    server.use(
      http.patch('/api/admin/nannies/:id', async ({ request }) => {
        body = (await request.json()) as UpdateAdminNanny;
        return ok(NANNY);
      }),
    );
    renderEditor();

    const file = new File(['x'], 'nanny.jpg', { type: 'image/jpeg' });
    // Field renders the hint as a sibling <span> inside the same <label>, so
    // the label's accessible text is "Photo" + the hint concatenated — an
    // exact match on "Photo" alone doesn't hit. Anchor on the start instead.
    await userEvent.upload(screen.getByLabelText(/^Photo/), file);
    await screen.findByAltText('Amira Hassan');

    // jsdom's date/number inputs don't take keystrokes the way a person types
    // them; setting the value directly is what the browser would end up with.
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '1996-01-20' } });
    fireEvent.change(screen.getByLabelText(/^Latitude/), { target: { value: '30.05' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '31.24' } });

    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      avatarUrl: 'https://cdn.example/uploaded.jpg',
      dateOfBirth: '1996-01-20',
      latitude: 30.05,
      longitude: 31.24,
    });
  });

  it('refuses a latitude without a longitude', async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(
      await screen.findByText('Latitude and longitude must be updated together.'),
    ).toBeInTheDocument();
  });

  it('clears the photo with null', async () => {
    let body: UpdateAdminNanny | null = null;
    server.use(
      http.patch('/api/admin/nannies/:id', async ({ request }) => {
        body = (await request.json()) as UpdateAdminNanny;
        return ok(NANNY);
      }),
    );
    renderWithProviders(
      <ToastProvider>
        <NannyProfileEditor
          nanny={{ ...NANNY, avatarUrl: 'https://cdn.example/old.jpg' }}
          certifications={[]}
          onDone={() => {}}
        />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ avatarUrl: null });
  });
});
