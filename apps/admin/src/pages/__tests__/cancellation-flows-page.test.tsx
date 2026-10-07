import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CANCELLATION_FLOWS } from '@admin/features/cancellation-flows/flows';
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

  it('links each known gap to its flow', () => {
    renderWithProviders(<CancellationFlowsPage />);

    const gaps = CANCELLATION_FLOWS.filter((flow) => flow.gap !== undefined);
    expect(screen.getByText(`Known gaps (${gaps.length})`)).toBeInTheDocument();
    for (const flow of gaps) {
      expect(screen.getByRole('link', { name: flow.title })).toHaveAttribute('href', `#${flow.id}`);
    }
  });
});
