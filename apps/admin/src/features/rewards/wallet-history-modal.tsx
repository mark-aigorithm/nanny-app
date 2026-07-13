import { useQuery } from '@tanstack/react-query';

import type { RewardLedgerEntry, RewardWalletSummary } from '@nanny-app/shared';

import {
  Coins,
  ErrorState,
  Gift,
  History,
  ICON_SIZE,
  LoadingState,
  Modal,
} from '@admin/components/ui';
import { fetchWalletHistory } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type Props = {
  wallet: RewardWalletSummary;
  onClose: () => void;
};

const LABELS: Record<RewardLedgerEntry['type'], string> = {
  EARN: 'Earned from booking',
  REDEEM: 'Redeemed for free hours',
  REFUND: 'Refunded — payment not completed',
  ADMIN_GRANT: 'Granted by admin',
  ADMIN_REVOKE: 'Revoked by admin',
};

function EntryIcon({ type }: { type: RewardLedgerEntry['type'] }) {
  if (type === 'EARN') return <Coins size={ICON_SIZE.inline} />;
  if (type === 'REDEEM' || type === 'REFUND') return <History size={ICON_SIZE.inline} />;
  return <Gift size={ICON_SIZE.inline} />;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function WalletHistoryModal({ wallet, onClose }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['reward-history', wallet.userId],
    queryFn: () => fetchWalletHistory(wallet.userId),
  });

  return (
    <Modal title={`Care Points history — ${wallet.name}`} onClose={onClose}>
      <div className="reward-history-summary">
        <div>
          <span className="reward-history-balance">{wallet.pointsBalance}</span>
          <span className="reward-history-balance-label">current balance</span>
        </div>
        <div className="reward-history-meta">
          <span>{wallet.lifetimeEarned} earned</span>
          <span>{wallet.lifetimeRedeemed} redeemed</span>
        </div>
      </div>

      {isLoading && <LoadingState label="Loading history…" />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {data && data.length === 0 && (
        <p className="reward-modal-lead">No Care Points activity yet.</p>
      )}
      {data && data.length > 0 && (
        <ul className="reward-history-list">
          {data.map((entry) => {
            const positive = entry.points >= 0;
            return (
              <li key={entry.id} className="reward-history-row">
                <span
                  className={`reward-history-icon reward-history-icon--${positive ? 'pos' : 'neg'}`}
                  aria-hidden
                >
                  <EntryIcon type={entry.type} />
                </span>
                <div className="reward-history-body">
                  <span className="reward-history-title">{LABELS[entry.type]}</span>
                  {entry.reason && <span className="reward-history-reason">{entry.reason}</span>}
                  <span className="reward-history-date">{formatDate(entry.createdAt)}</span>
                </div>
                <div className="reward-history-amount">
                  <span
                    className={`reward-points reward-points--${positive ? 'pos' : 'neg'}`}
                  >
                    {positive ? '+' : ''}
                    {entry.points}
                  </span>
                  <span className="reward-history-after">bal {entry.balanceAfter}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
