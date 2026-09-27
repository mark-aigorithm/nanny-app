import { useState } from 'react';

import type { TableSort } from '@admin/components/ui';

type UseTableSortResult<K extends string> = {
  sort: TableSort<K>;
  /** Pass to <Table onSortChange>. */
  onSortChange: (next: TableSort<K>) => void;
};

/**
 * Column-sort state for a server-sorted <Table>. Hand `sort` to the query (its
 * `sortBy`/`sortDir` are the API's params) and both values to the table.
 * `onChange` runs on every change — pass the pagination `reset`, since a page
 * number means nothing under a new order.
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
