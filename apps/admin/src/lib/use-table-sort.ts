import { useState } from 'react';

import type { TableSort } from '@admin/components/ui';

type UseTableSortResult<K extends string> = {
  sort: TableSort<K>;
  /** Pass to <Table onSortChange>. */
  onSortChange: (next: TableSort<K>) => void;
};

/**
 * Column-sort state for a **server-sorted** (paged) <Table>. Hand `sort` to the
 * query (its `sortBy`/`sortDir` are the API's params) and both values to the
 * table. `onChange` runs on every change — pass the pagination `reset`, since a
 * page number means nothing under a new order.
 */
export function useTableSort<K extends string>(
  initial: TableSort<K>,
  onChange?: () => void,
): UseTableSortResult<K> {
  const [sort, setSort] = useState(initial);
  return {
    sort,
    onSortChange: (next) => {
      setSort(next);
      onChange?.();
    },
  };
}

type SortValue = string | number | boolean | null | undefined;

/** How to read each sortable column's value off a row. */
export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

/**
 * Sorts rows by one value. Text compares the way people read it (case-blind,
 * "Item 2" before "Item 10"); empty values always go last, whichever way.
 */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
    if (typeof left === 'string' && typeof right === 'string') {
      return sign * left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
    }
    return sign * (Number(left) - Number(right));
  });
}

type UseClientSortResult<T, K extends string> = UseTableSortResult<K> & {
  /** The rows in the current order — pass these to <Table rows>. */
  rows: T[] | undefined;
};

/**
 * Column-sort state for a <Table> whose whole list is already loaded (no
 * paging): sorts in the browser. Name each sortable column's value in
 * `accessors`, then give the columns matching `sortKey`s.
 */
export function useClientSort<T, K extends string>(
  rows: T[] | undefined,
  accessors: SortAccessors<T, K>,
  initial: TableSort<K>,
): UseClientSortResult<T, K> {
  const [sort, setSort] = useState(initial);
  return {
    rows: rows && sortRows(rows, accessors[sort.sortBy], sort.sortDir),
    sort,
    onSortChange: setSort,
  };
}
