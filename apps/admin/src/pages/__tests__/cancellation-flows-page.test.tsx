import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DECISIONS } from '@admin/features/cancellation-flows/decisions';
import { CANCELLATION_FLOWS } from '@admin/features/cancellation-flows/flows';
import { MATRIX_COLUMNS, PAYMENT_MIXES } from '@admin/features/cancellation-flows/payment-matrix';
import { CancellationFlowsPage } from '@admin/pages/cancellation-flows-page';
import { renderWithProviders } from '@admin/test/render';

describe('CancellationFlowsPage', () => {
  it('lists every cancellation flow with its five outcomes', () => {
    renderWithProviders(<CancellationFlowsPage />);

    for (const flow of CANCELLATION_FLOWS) {
      const section = screen.getByRole('region', { name: flow.title });
      for (const label of ['Package hours', 'Care Points', 'Promo code', 'Money', 'Notifications']) {
        expect(within(section).getByText(label)).toBeInTheDocument();
      }
    }
  });

  it('crosses every payment method with every way of cancelling', () => {
    renderWithProviders(<CancellationFlowsPage />);

    const table = screen.getByRole('table');
    for (const column of MATRIX_COLUMNS) {
      expect(within(table).getByRole('columnheader', { name: column.label })).toBeInTheDocument();
    }
    for (const mix of PAYMENT_MIXES) {
      expect(within(table).getByText(mix.label)).toBeInTheDocument();
    }
  });

  it('shows every decision with all of its options', () => {
    renderWithProviders(<CancellationFlowsPage />);

    for (const decision of DECISIONS) {
      const section = screen.getByRole('region', { name: decision.title });
      for (const option of decision.options) {
        expect(within(section).getByRole('article', { name: option.label })).toBeInTheDocument();
      }
    }
  });

  it('links each known gap to its flow', () => {
    renderWithProviders(<CancellationFlowsPage />);

    const gapsSection = screen.getByRole('region', { name: 'Known gaps' });
    for (const flow of CANCELLATION_FLOWS.filter((f) => f.gap !== undefined)) {
      expect(within(gapsSection).getByRole('link', { name: flow.title })).toHaveAttribute(
        'href',
        `#${flow.id}`,
      );
    }
  });
});
