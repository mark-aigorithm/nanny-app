/**
 * usePagination's callbacks keep their identity across renders: tables list
 * them in effect deps (MotherPickerTable's search debounce depends on
 * `reset`), and a new function every render restarts those effects.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePagination } from '@admin/lib/use-pagination';

describe('usePagination', () => {
  it('keeps reset and setLimit stable across renders', () => {
    const { result, rerender } = renderHook(() => usePagination(20));
    const first = result.current;
    rerender();
    expect(result.current.reset).toBe(first.reset);
    expect(result.current.setLimit).toBe(first.setLimit);
  });

  it('reset and setLimit go back to page 1', () => {
    const { result } = renderHook(() => usePagination(20));
    act(() => result.current.setPage(3));
    act(() => result.current.reset());
    expect(result.current.page).toBe(1);
    act(() => result.current.setPage(2));
    act(() => result.current.setLimit(50));
    expect(result.current).toMatchObject({ page: 1, limit: 50 });
  });
});
