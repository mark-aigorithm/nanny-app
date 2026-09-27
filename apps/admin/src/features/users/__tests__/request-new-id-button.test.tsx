import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { RequestNewIdButton } from '@admin/features/users/request-new-id-button';
import { invalidateNannyId } from '@admin/lib/api';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

function renderButton(onDone = vi.fn()) {
  renderWithProviders(
    <ToastProvider>
      <RequestNewIdButton
        name="Nanny Test"
        consequence="Until it's approved she won't get new bookings."
        request={(reason) => invalidateNannyId('21', reason)}
        onDone={onDone}
      />
    </ToastProvider>,
  );
  return onDone;
}

describe('RequestNewIdButton', () => {
  it('sends the reason and reports success', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/nannies/:id/invalidate-id', async ({ request, params }) => {
        expect(params['id']).toBe('21');
        body = await request.json();
        return HttpResponse.json({ data: {}, error: null });
      }),
    );
    const onDone = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Request new ID' }));
    expect(screen.getByText(/ID photos will be deleted/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Reason/), 'Photo is blurry');
    await userEvent.click(screen.getByRole('button', { name: 'Delete ID and ask again' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toEqual({ reason: 'Photo is blurry' });
    expect(await screen.findByText('New ID requested')).toBeInTheDocument();
  });

  it('sends no reason when left blank', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/nannies/:id/invalidate-id', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: {}, error: null });
      }),
    );
    const onDone = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Request new ID' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete ID and ask again' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toEqual({});
  });

  it('keeps the dialog open and shows the error when the request fails', async () => {
    server.use(
      http.post('/api/admin/nannies/:id/invalidate-id', () =>
        HttpResponse.json(
          { data: null, error: 'There is no ID on file to invalidate.' },
          { status: 400 },
        ),
      ),
    );
    const onDone = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Request new ID' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete ID and ask again' }));

    expect(await screen.findByText('Couldn’t request a new ID')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete ID and ask again' })).toBeInTheDocument();
  });
});
