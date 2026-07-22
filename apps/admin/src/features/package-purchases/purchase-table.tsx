import type { AdminPackagePurchase } from '@nanny-app/shared';

import { Badge, type Column, Table } from '@admin/components/ui';
import { formatDateTime, formatEgp } from '@admin/lib/format';

type Props = {
  rows: AdminPackagePurchase[];
  onRowClick: (id: number) => void;
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

/** Fractional hours read cleanly — whole numbers show with no decimal noise. */
function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
}

/**
 * The Package Purchases table: one row per purchase, opening the ledger
 * drill-in on click. Mirrors the mothers/bookings tables' column shape.
 */
export function PurchaseTable({ rows, onRowClick }: Props) {
  const columns: Column<AdminPackagePurchase>[] = [
    {
      key: 'buyer',
      header: 'Buyer',
      render: (p) => (
        <>
          {p.buyerName}
          <div className="table-subtext">{p.buyerEmail}</div>
        </>
      ),
    },
    { key: 'package', header: 'Package', render: (p) => p.packageName },
    {
      key: 'hours',
      header: 'Hours',
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
      align: 'right',
      nowrap: true,
      render: (p) => formatEgp(p.pricePaid),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>,
    },
    {
      key: 'purchased',
      header: 'Purchased',
      nowrap: true,
      render: (p) => (p.purchasedAt ? formatDateTime(p.purchasedAt) : EMPTY),
    },
    {
      key: 'expires',
      header: 'Expires',
      nowrap: true,
      render: (p) => (p.expiresAt ? formatDateTime(p.expiresAt) : EMPTY),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      empty="No package purchases match your filters."
      onRowClick={(p) => onRowClick(p.id)}
    />
  );
}
