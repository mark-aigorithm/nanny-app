import type { AdminPackagePurchase, AdminPackagePurchaseSortKey } from '@nanny-app/shared';

import { Badge, type Column, idColumn, Table, type TableSort } from '@admin/components/ui';
import { formatDateTime, formatEgp, formatHours } from '@admin/lib/format';

type Props = {
  rows: AdminPackagePurchase[];
  onRowClick: (id: number) => void;
  /** Whether a search or non-"ALL" status filter is currently applied. */
  hasActiveFilters: boolean;
  /** The server-side column sort (see `useTableSort`). */
  sort: TableSort<AdminPackagePurchaseSortKey>;
  onSortChange: (next: TableSort<AdminPackagePurchaseSortKey>) => void;
};

const EMPTY = <span className="table-empty">—</span>;

function statusTone(
  status: AdminPackagePurchase['status'],
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'EXPIRED') return 'warning';
  if (status === 'REFUNDED') return 'danger';
  return 'neutral'; // PENDING_PAYMENT
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

/**
 * The Package Purchases table: one row per purchase, opening the ledger
 * drill-in on click. Mirrors the mothers/bookings tables' column shape.
 */
export function PurchaseTable({ rows, onRowClick, hasActiveFilters, sort, onSortChange }: Props) {
  const columns: Column<AdminPackagePurchase, AdminPackagePurchaseSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    {
      key: 'buyer',
      header: 'Buyer',
      sortKey: 'buyer',
      render: (p) => (
        <>
          {p.buyerName}
          <div className="table-subtext">{p.buyerEmail}</div>
        </>
      ),
    },
    { key: 'package', header: 'Package', sortKey: 'package', render: (p) => p.packageName },
    {
      key: 'hours',
      header: 'Hours',
      sortKey: 'hours',
      sortFirst: 'desc',
      align: 'right',
      nowrap: true,
      render: (p) => `${formatHours(p.hoursRemaining)} / ${p.hoursPurchased}`,
    },
    {
      key: 'consumed',
      header: 'Consumed',
      align: 'right',
      nowrap: true,
      render: (p) => `${formatHours(p.hoursConsumed)}h`,
    },
    {
      key: 'price',
      header: 'Price',
      sortKey: 'price',
      sortFirst: 'desc',
      align: 'right',
      nowrap: true,
      render: (p) => formatEgp(p.pricePaid),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (p) => <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>,
    },
    {
      key: 'purchased',
      header: 'Purchased',
      sortKey: 'purchased',
      sortFirst: 'desc',
      nowrap: true,
      render: (p) => (p.purchasedAt ? formatDateTime(p.purchasedAt) : EMPTY),
    },
    {
      key: 'expires',
      header: 'Expires',
      sortKey: 'expires',
      sortFirst: 'desc',
      nowrap: true,
      render: (p) => (p.expiresAt ? formatDateTime(p.expiresAt) : EMPTY),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      empty={
        hasActiveFilters ? 'No package purchases match your filters.' : 'No package purchases yet.'
      }
      onRowClick={(p) => onRowClick(p.id)}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
