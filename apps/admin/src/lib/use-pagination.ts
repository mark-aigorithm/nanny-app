import { useCallback, useState } from 'react';

import { ADMIN_DEFAULT_PAGE_SIZE } from '@nanny-app/shared';

type UsePaginationResult = {
  page: number;
  limit: number;
  setPage: (page: number) => void;
  /** Change the page size and jump back to the first page. */
  setLimit: (limit: number) => void;
  /** Reset to page 1 — call when a filter changes so results stay in range. */
  reset: () => void;
};

/**
 * Local page/limit state for a server-paginated table. Changing the page size
 * resets to page 1 so the user never lands past the last page.
 */
export function usePagination(
  initialLimit: number = ADMIN_DEFAULT_PAGE_SIZE,
): UsePaginationResult {
  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(initialLimit);
  // Stable, because callers list these in effect deps.
  const setLimit = useCallback((next: number) => {
    setLimitState(next);
    setPage(1);
  }, []);
  const reset = useCallback(() => setPage(1), []);

  return { page, limit, setPage, setLimit, reset };
}
