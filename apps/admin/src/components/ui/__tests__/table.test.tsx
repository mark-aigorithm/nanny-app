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

  it('gives a column the width it asks for', () => {
    render(
      <Table
        columns={[{ key: 'name', header: 'Name', width: '60%', render: (row: Row) => row.name }]}
        rows={rows}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveStyle({ width: '60%' });
  });

  it('renders plain headers when the table is not sortable', () => {
    render(<Table columns={columns} rows={rows} rowKey={(row) => row.id} />);

    expect(screen.queryByRole('button', { name: /Name/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'ID' })).not.toHaveAttribute('aria-sort');
  });
});

describe('Table row clicks', () => {
  const clickable = (onRowClick: (row: Row) => void, rowClickMouseOnly?: boolean) => (
    <Table
      columns={[
        { key: 'pick', header: 'Pick', render: (row: Row) => <input type="checkbox" aria-label={`Select ${row.name}`} /> },
        { key: 'name', header: 'Name', render: (row: Row) => row.name },
      ]}
      rows={rows}
      rowKey={(row) => row.id}
      onRowClick={onRowClick}
      rowClickMouseOnly={rowClickMouseOnly}
    />
  );

  it('opens the row on Enter or Space pressed on the row itself', () => {
    const onRowClick = vi.fn();
    render(clickable(onRowClick));
    const row = screen.getByRole('button', { name: /Amira/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('leaves a key pressed on a control inside the row to that control', () => {
    const onRowClick = vi.fn();
    render(clickable(onRowClick));
    const box = screen.getByRole('checkbox', { name: 'Select Amira' });
    const notCancelled = fireEvent.keyDown(box, { key: ' ' });
    expect(onRowClick).not.toHaveBeenCalled();
    // Not preventDefault-ed, so the browser still toggles the box.
    expect(notCancelled).toBe(true);
  });

  it('keeps a mouse-only row click off the keyboard and out of the accessibility tree', () => {
    const onRowClick = vi.fn();
    render(clickable(onRowClick, true));
    expect(screen.queryByRole('button', { name: /Amira/ })).toBeNull();
    const row = screen.getByRole('row', { name: /Amira/ });
    expect(row).not.toHaveAttribute('tabindex');
    fireEvent.click(screen.getByText('Amira'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
