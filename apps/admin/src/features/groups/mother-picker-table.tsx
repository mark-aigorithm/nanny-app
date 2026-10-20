import {
  ADMIN_PAGE_SIZES,
  type DynamicGroupRules,
  type MotherPickerRow,
  type MotherPickerSortKey,
} from '@nanny-app/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import {
  type Column,
  ErrorState,
  SearchInput,
  Pagination,
  StaleRefreshBanner,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchMotherPicker } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDate, formatEgp } from '@admin/lib/format';
import { usePagination } from '@admin/lib/use-pagination';
import { useTableSort } from '@admin/lib/use-table-sort';

type MotherPickerTableProps = {
  /** User ids ticked so far. The parent owns this so ticks survive paging and searching. */
  selected: ReadonlySet<number>;
  onSelectedChange: (next: Set<number>) => void;
  /** List only this group's members. */
  groupId?: number;
  /** Leave out this group's members (the group's own "Add mothers" picker). */
  excludeGroupId?: number;
  /** A dynamic group's rules: list only the mothers they match now. */
  rules?: DynamicGroupRules;
  /** False for a read-only list: no checkboxes, and a row click ticks nothing. */
  selectable?: boolean;
  /** Each page of rows as it loads — lets a caller name the mothers it has ticked. */
  onRowsLoaded?: (rows: MotherPickerRow[]) => void;
};

const day = (iso: string | null) => (iso ? formatDate(iso) : '—');

/**
 * Mothers with their booking activity, sorted by the API (aggregates are
 * computed before paging). Bookings, hours and spend count completed bookings
 * only. Generic: group membership and survey recipients both use it.
 */
export function MotherPickerTable({
  selected,
  onSelectedChange,
  groupId,
  excludeGroupId,
  rules,
  selectable = true,
  onRowsLoaded,
}: MotherPickerTableProps) {
  const { page, limit, setPage, setLimit, reset } = usePagination();
  const { sort, onSortChange } = useTableSort<MotherPickerSortKey>(
    { sortBy: 'createdAt', sortDir: 'desc' },
    reset,
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce typing so each keystroke isn't a request.
  // Only commits when the text actually changed, so it never fires on mount
  // and yanks someone who has already paged back to page 1.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      reset();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, reset]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['mother-picker', { search, groupId, excludeGroupId, rules, page, limit, ...sort }],
    queryFn: () => fetchMotherPicker({ search, groupId, excludeGroupId, rules, page, limit, ...sort }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (data) onRowsLoaded?.(data.data);
  }, [data, onRowsLoaded]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    onSelectedChange(next);
  };
  const pageRows = data?.data ?? [];
  const searchId = useId();
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const someOnPage = !allOnPage && pageRows.some((r) => selected.has(r.id));
  const togglePage = () => {
    const next = new Set(selected);
    for (const r of pageRows) {
      if (allOnPage) next.delete(r.id);
      else next.add(r.id);
    }
    onSelectedChange(next);
  };

  const selectColumn: Column<MotherPickerRow, MotherPickerSortKey> = {
    key: 'select',
    header: (
      <input
        type="checkbox"
        aria-label="Select all on this page"
        checked={allOnPage}
        // Some but not all of the page ticked: the header box shows a dash.
        ref={(el) => {
          if (el) el.indeterminate = someOnPage;
        }}
        onChange={togglePage}
      />
    ),
    render: (r) => (
      <input
        type="checkbox"
        aria-label={`Select ${r.name}`}
        checked={selected.has(r.id)}
        onChange={() => toggle(r.id)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };
  const columns: Column<MotherPickerRow, MotherPickerSortKey>[] = [
    ...(selectable ? [selectColumn] : []),
    { key: 'name', header: 'Name', sortKey: 'name', render: (r) => r.name, width: '22%' },
    { key: 'phone', header: 'Phone', nowrap: true, render: (r) => r.phone ?? '—' },
    {
      key: 'bookings',
      header: 'Bookings',
      sortKey: 'completedBookings',
      sortFirst: 'desc',
      align: 'right',
      render: (r) => r.completedBookings,
    },
    {
      key: 'hours',
      header: 'Hours booked',
      sortKey: 'hoursBooked',
      sortFirst: 'desc',
      align: 'right',
      render: (r) => r.hoursBooked,
    },
    {
      key: 'spent',
      header: 'Total spent',
      sortKey: 'totalSpent',
      sortFirst: 'desc',
      align: 'right',
      render: (r) => formatEgp(r.totalSpent),
    },
    {
      key: 'lastBooking',
      header: 'Last booking',
      sortKey: 'lastBookingAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => day(r.lastBookingAt),
    },
    {
      key: 'joined',
      header: 'Joined',
      sortKey: 'createdAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => day(r.createdAt),
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      sortKey: 'lastLoginAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => day(r.lastLoginAt),
    },
    {
      key: 'lastAppOpen',
      header: 'Last app open',
      sortKey: 'lastAppOpenAt',
      sortFirst: 'desc',
      nowrap: true,
      render: (r) => day(r.lastAppOpenAt),
    },
  ];

  return (
    <div>
      <div className="filter-bar">
        <SearchInput
          id={searchId}
          label="Search mothers"
          showLabel
          className="mother-picker-search"
          placeholder="Name, phone or email"
          value={searchInput}
          onChange={setSearchInput}
        />
      </div>
      <p className="mother-picker-hint">
        {selectable && `${selected.size} selected. `}
        {excludeGroupId !== undefined && 'Mothers already in the group aren’t listed. '}
        {rules !== undefined && 'Everyone matching the saved rules, worked out now. '}
        Bookings, hours and spend count completed bookings only.
      </p>
      {isLoading && <TableSkeleton columns={columns.length} />}
      {error != null && !data && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {data && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <Table
            columns={columns}
            rows={pageRows}
            rowKey={(r) => r.id}
            onRowClick={selectable ? (r) => toggle(r.id) : undefined}
            rowClickMouseOnly
            sort={sort}
            onSortChange={onSortChange}
            empty={search ? 'No mothers match this search.' : 'No mothers here yet.'}
          />
          <Pagination
            page={page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            limit={limit}
            onPageChange={setPage}
            limitOptions={ADMIN_PAGE_SIZES}
            onLimitChange={setLimit}
            label="mothers"
          />
        </>
      )}
    </div>
  );
}
