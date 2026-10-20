/** The search field clears with its own button and hands the cursor back. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SearchInput } from '../search-input';

function Harness({ showLabel = false }: { showLabel?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <SearchInput label="Search mothers" showLabel={showLabel} value={value} onChange={setValue} />
  );
}

describe('SearchInput', () => {
  it('shows a clear button only once something is typed, and clearing refocuses the field', async () => {
    render(<Harness />);
    const field = screen.getByRole('searchbox', { name: 'Search mothers' });
    expect(screen.queryByRole('button', { name: 'Clear search mothers' })).not.toBeInTheDocument();

    await userEvent.type(field, 'amy');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search mothers' }));

    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear search mothers' })).not.toBeInTheDocument();
  });

  it('can show its label above the field', () => {
    render(<Harness showLabel />);
    expect(screen.getByText('Search mothers', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search mothers' })).toBeInTheDocument();
  });
});
