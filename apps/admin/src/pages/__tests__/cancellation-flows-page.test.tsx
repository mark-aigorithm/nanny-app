import { CANCELLATION_DECISIONS } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { CANCELLATION_FLOWS } from '@admin/features/cancellation-flows/flows';
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

describe('CancellationFlowsPage — what happens today', () => {
  function rowFor(title: string) {
    return screen.getByText(new RegExp(`^\\d+\\. ${title}$`)).closest('tr')!;
  }

  it('puts every flow in one table, with its five outcomes as columns', () => {
    server.use(decisions());
    renderPage();

    const table = screen.getByRole('table');
    for (const label of ['Scenario', 'Package hours', 'Care Points', 'Promo code', 'Money', 'Notifications']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    for (const flow of CANCELLATION_FLOWS) {
      expect(within(table).getByText(new RegExp(`^\\d+\\. ${flow.title}$`))).toBeInTheDocument();
    }
  });

  it('re-reads every flow for the payment picked', async () => {
    server.use(decisions());
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Paid with'));
    await user.click(screen.getByRole('option', { name: 'Card only' }));

    // Paid by card alone, there were no hours to lose.
    const paidCancel = rowFor('Mother cancels a paid booking outside the cancellation window');
    expect(within(paidCancel).getAllByText('Not used.')).toHaveLength(3);
  });

  it('says nannies cannot cancel, and lists no nanny cancellation', () => {
    server.use(decisions());
    renderPage();

    expect(screen.getByText('Nannies can’t cancel bookings.')).toBeInTheDocument();
    expect(CANCELLATION_FLOWS.some((flow) => (flow.who as string) === 'Nanny')).toBe(false);
  });

  it('says when a flow cannot happen with the payment picked', async () => {
    server.use(decisions());
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Paid with'));
    await user.click(screen.getByRole('option', { name: 'Package hours cover it all' }));

    // A booking with nothing to pay confirms itself on accept — never accepted-but-unpaid.
    const unpaid = rowFor('Mother cancels an accepted booking she has not paid for yet');
    expect(unpaid.nextElementSibling).toHaveTextContent(/Can’t happen with this payment/);
  });

  it('narrows to who cancels', async () => {
    server.use(decisions());
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Who cancels'));
    await user.click(screen.getByRole('option', { name: 'Admin' }));

    const table = screen.getByRole('table');
    for (const flow of CANCELLATION_FLOWS) {
      const shown = within(table).queryByText(new RegExp(`^\\d+\\. ${flow.title}$`)) !== null;
      expect(shown, flow.id).toBe(flow.who === 'Admin');
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
