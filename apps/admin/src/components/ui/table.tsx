import { Fragment, type KeyboardEvent, type ReactNode } from 'react';

import { Card } from './card';
import { ArrowDown, ArrowUp, ChevronsUpDown } from './icon';

/** Which column a table is sorted by, and which way. Same shape as the API's sort params. */
export type TableSort<K extends string = string> = { sortBy: K; sortDir: 'asc' | 'desc' };

export type Column<T, K extends string = string> = {
  /** Stable key for the column. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Keep the cell on one line (useful in the wrapping variant). */
  nowrap?: boolean;
  /**
   * Makes the header clickable to sort by this key (needs the table's `sort`
   * and `onSortChange`). The first click sorts `sortFirst` — 'desc' suits
   * dates and amounts, where the newest or biggest is what you want to see.
   */
  sortKey?: K;
  sortFirst?: 'asc' | 'desc';
};

type TableProps<T, K extends string = string> = {
  columns: Column<T, K>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Shown (inside a Card) when there are no rows. */
  empty?: ReactNode;
  /**
   * Cells wrap to fit the container instead of forcing a fixed wide width.
   * Default true so tables never overflow the page on desktop; individual
   * columns can opt back to one line with `nowrap`.
   */
  wrap?: boolean;
  /**
   * Optional expandable content rendered in a full-width row beneath a row.
   * Return null/undefined for rows that are not expanded.
   */
  renderExpanded?: (row: T) => ReactNode;
  /**
   * Makes each row clickable (e.g. to open a detail page). The row gets a
   * pointer cursor and keyboard support (Enter/Space). Interactive controls
   * inside a cell (menus, selects, buttons) should call `stopPropagation` on
   * their own click so they don't also trigger the row click.
   */
  onRowClick?: (row: T) => void;
  /**
   * Optional per-row class (e.g. SLA highlighting). Return undefined for rows
   * that need no extra styling.
   */
  rowClassName?: (row: T) => string | undefined;
  /**
   * The current column sort. Sorting is the caller's job — usually the API,
   * since a paged table only holds one page — the table only shows it and
   * reports header clicks through `onSortChange`. See `useTableSort`.
   */
  sort?: TableSort<K>;
  onSortChange?: (next: TableSort<K>) => void;
};

/**
 * Generic data table. The single shared implementation behind every admin
 * table — pass a column config and rows instead of hand-rolling <table> markup.
 */
export function Table<T, K extends string = string>({
  columns,
  rows,
  rowKey,
  empty = 'Nothing to show here yet.',
  wrap = true,
  renderExpanded,
  onRowClick,
  rowClassName,
  sort,
  onSortChange,
}: TableProps<T, K>) {
  if (rows.length === 0) {
    return (
      <Card>
        <p className="empty-state">{empty}</p>
      </Card>
    );
  }

  const clickable = onRowClick != null;

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <Card flush>
      <div className="table-wrap">
        <table
          className={`table${wrap ? ' table--full' : ''}${clickable ? ' table--clickable' : ''}`}
        >
          <thead>
            <tr>
              {columns.map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  sort={sort}
                  onSortChange={onSortChange}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = renderExpanded?.(row);
              return (
                <Fragment key={rowKey(row)}>
                  <tr
                    className={rowClassName?.(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={clickable ? (event) => handleKeyDown(event, row) : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={column.nowrap ? 'cell-nowrap' : undefined}
                        style={column.align ? { textAlign: column.align } : undefined}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expanded != null && expanded !== false && (
                    <tr>
                      <td colSpan={columns.length}>{expanded}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type HeaderCellProps<T, K extends string> = {
  column: Column<T, K>;
  sort: TableSort<K> | undefined;
  onSortChange: ((next: TableSort<K>) => void) | undefined;
};

/** A column header — a sort button when the column is sortable. */
function HeaderCell<T, K extends string>({ column, sort, onSortChange }: HeaderCellProps<T, K>) {
  const style = column.align ? { textAlign: column.align } : undefined;
  const { sortKey } = column;
  if (sortKey === undefined || !onSortChange) {
    return <th style={style}>{column.header}</th>;
  }

  const direction = sort?.sortBy === sortKey ? sort.sortDir : undefined;
  const active = direction !== undefined;
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown;

  return (
    <th
      style={style}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        className={`table-sort${active ? ' table-sort--active' : ''}`}
        onClick={() =>
          onSortChange({
            sortBy: sortKey,
            // A second click on the same column flips it; a new column starts its own way.
            sortDir: direction ? (direction === 'asc' ? 'desc' : 'asc') : (column.sortFirst ?? 'asc'),
          })
        }
      >
        {column.header}
        <SortIcon size={14} aria-hidden />
      </button>
    </th>
  );
}
