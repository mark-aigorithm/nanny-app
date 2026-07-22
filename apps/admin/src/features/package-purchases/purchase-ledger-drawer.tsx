import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import type { PackageHoursLedgerEntry } from '@nanny-app/shared';

import { Badge, ErrorState, LoadingState, Modal } from '@admin/components/ui';
import { fetchPackagePurchaseDetail } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime, formatEgp } from '@admin/lib/format';

type Props = {
  id: number;
  onClose: () => void;
};

const LABELS: Record<PackageHoursLedgerEntry['type'], string> = {
  PURCHASE: 'Purchased',
  REDEMPTION: 'Redeemed on a booking',
  REFUND: 'Refunded',
  EXPIRY: 'Expired',
  ADMIN_ADJUST: 'Adjusted by admin',
};

function typeTone(
  type: PackageHoursLedgerEntry['type'],
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (type === 'PURCHASE') return 'success';
  if (type === 'REFUND') return 'danger';
  if (type === 'EXPIRY' || type === 'ADMIN_ADJUST') return 'warning';
  return 'neutral'; // REDEMPTION
}

/** Fractional hours read cleanly — whole numbers show with no decimal noise. */
function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
}

/**
 * Ledger drill-in for one package purchase — realized as a Modal (the repo
 * has no separate drawer primitive), mirroring WalletHistoryModal's shape:
 * a summary strip up top, then the full timeline of hours movements below.
 */
export function PurchaseLedgerDrawer({ id, onClose }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['package-purchase', id],
    queryFn: () => fetchPackagePurchaseDetail(id),
  });

  return (
    <Modal title={data ? `${data.packageName} — ${data.buyerName}` : 'Package purchase'} onClose={onClose}>
      {isLoading && <LoadingState label="Loading purchase…" />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {data && (
        <>
          <div className="purchase-ledger-summary">
            <div>
              <span className="purchase-ledger-balance">{formatHours(data.hoursRemaining)}</span>
              <span className="purchase-ledger-balance-label">
                of {data.hoursPurchased}h remaining
              </span>
            </div>
            <div className="purchase-ledger-meta">
              <span>{data.buyerEmail}</span>
              <span>{formatHours(data.hoursConsumed)}h consumed</span>
              <span>{formatEgp(data.pricePaid)}</span>
            </div>
          </div>

          {data.ledger.length === 0 && <p className="empty-state">No ledger activity yet.</p>}
          {data.ledger.length > 0 && (
            <ul className="purchase-ledger-list">
              {data.ledger.map((entry) => {
                const positive = entry.hours >= 0;
                return (
                  <li key={entry.id} className="purchase-ledger-row">
                    <Badge tone={typeTone(entry.type)}>{LABELS[entry.type]}</Badge>
                    <div className="purchase-ledger-body">
                      {entry.reason && (
                        <span className="purchase-ledger-reason">{entry.reason}</span>
                      )}
                      {entry.bookingId != null && (
                        <Link className="purchase-ledger-link" to={`/bookings/${entry.bookingId}`}>
                          View booking
                        </Link>
                      )}
                      <span className="purchase-ledger-date">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <div className="purchase-ledger-amount">
                      <span
                        className={`purchase-ledger-hours purchase-ledger-hours--${positive ? 'pos' : 'neg'}`}
                      >
                        {positive ? '+' : ''}
                        {formatHours(entry.hours)}h
                      </span>
                      <span className="purchase-ledger-after">
                        bal {formatHours(entry.balanceAfter)}h
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
