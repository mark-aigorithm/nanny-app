import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Tabs } from '../tabs';

const TABS = [
  { value: 'results', label: 'Results' },
  { value: 'recipients', label: 'Recipients' },
  { value: 'log', label: 'Log' },
] as const;

function Harness() {
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('results');
  return (
    <Tabs label="Survey sections" tabs={TABS} value={tab} onChange={setTab}>
      <p>Showing {tab}</p>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('links each tab to one labelled tabpanel', () => {
    render(<Harness />);
    const results = screen.getByRole('tab', { name: 'Results' });
    const panel = screen.getByRole('tabpanel', { name: 'Results' });
    expect(results).toHaveAttribute('aria-selected', 'true');
    expect(results).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveTextContent('Showing results');
  });

  it('is one tab stop: only the selected tab is in the Tab order', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Results' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Recipients' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves and selects with the arrow keys, Home and End, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('tab', { name: 'Results' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Recipients' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Showing recipients');

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Log' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Results' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Log' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Results' })).toHaveAttribute('aria-selected', 'true');
  });
});
