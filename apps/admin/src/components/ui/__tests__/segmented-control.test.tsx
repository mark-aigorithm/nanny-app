/**
 * The segmented control is a native radio group: one Tab stop on the chosen
 * option, arrow keys move and choose, and the legend names the group.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SegmentedControl } from '@admin/components/ui';

type Channel = 'IN_APP' | 'PUSH' | 'BOTH';
const OPTIONS = [
  { value: 'IN_APP', label: 'In-app' },
  { value: 'PUSH', label: 'Push' },
  { value: 'BOTH', label: 'Both' },
] as const;

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<Channel>('IN_APP');
  return (
    <>
      <button type="button">before</button>
      <SegmentedControl legend="Channel" value={value} options={OPTIONS} onChange={setValue} disabled={disabled} />
      <output>{value}</output>
    </>
  );
}

describe('SegmentedControl', () => {
  it('is a radio group named by its legend, and a click chooses', async () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Channel' });
    expect(within(group).getByRole('radio', { name: 'In-app' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'Both' }));
    expect(screen.getByRole('status')).toHaveTextContent('BOTH');
  });

  it('takes one Tab stop on the chosen option, and arrow keys move the choice', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'before' }));
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'In-app' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Push' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('PUSH');
  });

  it('locks every option when disabled', () => {
    render(<Harness disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
