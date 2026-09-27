import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Table, type Column } from '../table';

type Row = { id: number; name: string; joined: string };
const rows: Row[] = [{ id: 1, name: 'Amira', joined: '2026-09-01' }];

const columns: Column<Row, 'name' | 'joined'>[] = [
  { key: 'name', header: 'Name', sortKey: 'name', render: (row) => row.name },
  {
    key: 'joined',
    header: 'Joined',
    sortKey: 'joined',
    sortFirst: 'desc',
    render: (row) => row.joined,
  },
  { key: 'id', header: 'ID', render: (row) => row.id },
];

describe('Table sorting', () => {
  it('flips the active column and marks it with aria-sort', () => {
    const onSortChange = vi.fn();
    render(
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        sort={{ sortBy: 'name', sortDir: 'asc' }}
        onSortChange={onSortChange}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'name', sortDir: 'desc' });
  });

  it('starts a new column in its own first direction', () => {
    const onSortChange = vi.fn();
    render(
      <Table
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        sort={{ sortBy: 'name', sortDir: 'asc' }}
        onSortChange={onSortChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Joined/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sortBy: 'joined', sortDir: 'desc' });
  });

  it('renders plain headers when the table is not sortable', () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />);

    expect(screen.queryByRole('button', { name: /Name/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'ID' })).not.toHaveAttribute('aria-sort');
  });
});
