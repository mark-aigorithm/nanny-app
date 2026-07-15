import { Fragment, type KeyboardEvent, type ReactNode } from 'react';

import { Card } from './card';

export type Column<T> = {
  /** Stable key for the column. */
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Keep the cell on one line (useful in the wrapping variant). */
  nowrap?: boolean;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
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
};

/**
 * Generic data table. The single shared implementation behind every admin
 * table — pass a column config and rows instead of hand-rolling <table> markup.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  empty = 'Nothing to show here yet.',
  wrap = true,
  renderExpanded,
  onRowClick,
  rowClassName,
}: TableProps<T>) {
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
                <th key={column.key} style={column.align ? { textAlign: column.align } : undefined}>
                  {column.header}
                </th>
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
