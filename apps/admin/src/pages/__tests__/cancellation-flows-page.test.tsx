import { CANCELLATION_DECISIONS } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { CANCELLATION_FLOWS } from '@admin/features/cancellation-flows/flows';
import { MATRIX_COLUMNS, PAYMENT_MIXES } from '@admin/features/cancellation-flows/payment-matrix';
import { CancellationFlowsPage } from '@admin/pages/cancellation-flows-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const FIRST = CANCELLATION_DECISIONS[0]!;
const CHOICE = FIRST.options[1]!;

function ok<T>(data: T) {
  return HttpResponse.json({ data, error: null });
}

function decisions(entries: Record<string, unknown> = {}) {
  return http.get('/api/cancellation-policy', () => ok({ entries }));
}

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <CancellationFlowsPage />
    </ToastProvider>,
  );
}

describe('CancellationFlowsPage — content', () => {
  it('lists every cancellation flow with its five outcomes', () => {
    server.use(decisions());
    renderPage();

    for (const flow of CANCELLATION_FLOWS) {
      const section = screen.getByRole('region', { name: flow.title });
      for (const label of ['Package hours', 'Care Points', 'Promo code', 'Money', 'Notifications']) {
        expect(within(section).getByText(label)).toBeInTheDocument();
      }
    }
  });

  it('crosses every payment method with every way of cancelling', () => {
    server.use(decisions());
    renderPage();

    const table = screen.getByRole('table');
    for (const column of MATRIX_COLUMNS) {
      expect(within(table).getByRole('columnheader', { name: column.label })).toBeInTheDocument();
    }
    for (const mix of PAYMENT_MIXES) {
      expect(within(table).getByText(mix.label)).toBeInTheDocument();
    }
  });

  it('shows every decision with all of its options', () => {
    server.use(decisions());
    renderPage();

    for (const decision of CANCELLATION_DECISIONS) {
      const section = screen.getByRole('region', { name: decision.title });
      for (const option of decision.options) {
        expect(within(section).getByRole('article', { name: option.label })).toBeInTheDocument();
      }
    }
  });

  it('links each known gap to its flow', () => {
    server.use(decisions());
    renderPage();

    const gapsSection = screen.getByRole('region', { name: 'Known gaps' });
    for (const flow of CANCELLATION_FLOWS.filter((f) => f.gap !== undefined)) {
      expect(within(gapsSection).getByRole('link', { name: flow.title })).toHaveAttribute(
        'href',
        `#${flow.id}`,
      );
    }
  });
});

describe('CancellationFlowsPage — recording answers', () => {
  it('records the picked option with who decided and why', async () => {
    let body: unknown;
    server.use(
      decisions(),
      http.put(`/api/cancellation-policy/${FIRST.id}`, async ({ request }) => {
        body = await request.json();
        return ok({ ...(body as object), updatedAt: '2026-10-07T10:00:00.000Z' });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    const section = screen.getByRole('region', { name: FIRST.title });
    await user.click(
      await within(section).findByRole('button', {
        name: `Pick “${CHOICE.label}” for ${FIRST.title}`,
      }),
    );
    await user.type(within(section).getByLabelText('Decided by'), 'Sara');
    await user.type(within(section).getByLabelText(/Note/), 'Agreed with ops');
    await user.click(within(section).getByRole('button', { name: 'Record decision' }));

    await waitFor(() =>
      expect(body).toEqual({ optionId: CHOICE.id, decidedBy: 'Sara', note: 'Agreed with ops' }),
    );
  });

  it('shows an answer someone already recorded, and the running count', async () => {
    server.use(
      decisions({
        [FIRST.id]: {
          optionId: CHOICE.id,
          decidedBy: 'Sara',
          note: 'Agreed with ops',
          updatedAt: '2026-10-07T10:00:00.000Z',
        },
      }),
    );
    renderPage();

    const section = screen.getByRole('region', { name: FIRST.title });
    expect(await within(section).findByText(`Decided: ${CHOICE.label}`)).toBeInTheDocument();
    expect(within(section).getByText('Agreed with ops', { selector: 'span' })).toBeInTheDocument();
    expect(
      within(within(section).getByRole('article', { name: CHOICE.label })).getByText('Chosen'),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      `1 of ${CANCELLATION_DECISIONS.length} decisions recorded`,
    );
  });

  it('re-opens a recorded decision', async () => {
    let cleared = false;
    server.use(
      decisions({
        [FIRST.id]: { optionId: CHOICE.id, decidedBy: '', note: '', updatedAt: '2026-10-07T10:00:00.000Z' },
      }),
      http.delete(`/api/cancellation-policy/${FIRST.id}`, () => {
        cleared = true;
        return ok({ cleared: true });
      }),
    );
    renderPage();
    const user = userEvent.setup();

    const section = screen.getByRole('region', { name: FIRST.title });
    await user.click(await within(section).findByRole('button', { name: 'Re-open' }));

    await waitFor(() => expect(cleared).toBe(true));
  });

  it('stays readable but read-only when the server has recording switched off', async () => {
    server.use(
      http.get('/api/cancellation-policy', () =>
        HttpResponse.json({ data: null, error: 'Not found' }, { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findByText(/switched off on this server/)).toBeInTheDocument();
    const section = screen.getByRole('region', { name: FIRST.title });
    expect(within(section).queryByRole('button', { name: 'Record decision' })).not.toBeInTheDocument();
    expect(within(section).getByRole('article', { name: CHOICE.label })).toBeInTheDocument();
  });
});
