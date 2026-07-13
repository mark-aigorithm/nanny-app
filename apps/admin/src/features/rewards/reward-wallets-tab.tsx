import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { RewardWalletSummary } from '@nanny-app/shared';

import {
  ActionMenu,
  type Column,
  ErrorState,
  Gift,
  History,
  ICON_SIZE,
  Input,
  MenuItem,
  Table,
  TableSkeleton,
} from '@admin/components/ui';
import { fetchRewardWallets } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { GrantPointsModal } from './grant-points-modal';
import { WalletHistoryModal } from './wallet-history-modal';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function RewardWalletsTab() {
  const { data: wallets, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['reward-wallets'],
    queryFn: fetchRewardWallets,
  });

  const [search, setSearch] = useState('');
  const [historyFor, setHistoryFor] = useState<RewardWalletSummary | null>(null);
  const [grantFor, setGrantFor] = useState<RewardWalletSummary | null>(null);

  const filtered = useMemo(() => {
    if (!wallets) return wallets;
    const q = search.trim().toLowerCase();
    if (!q) return wallets;
    return wallets.filter(
      (w) => w.name.toLowerCase().includes(q) || w.email.toLowerCase().includes(q),
    );
  }, [wallets, search]);

  const columns: Column<RewardWalletSummary>[] = [
    {
      key: 'user',
      header: 'Parent',
      render: (w) => (
        <div className="nanny-cell">
          <span className="nanny-avatar" aria-hidden>
            {initials(w.name)}
          </span>
          <div>
            <div className="nanny-name">{w.name}</div>
            <div className="table-subtext">{w.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      nowrap: true,
      render: (w) =>
        w.pointsBalance > 0 ? (
          <span className="reward-pill">{w.pointsBalance} pts</span>
        ) : (
          <span className="table-subtext">0 pts</span>
        ),
    },
    {
      key: 'earned',
      header: 'Lifetime earned',
      align: 'right',
      nowrap: true,
      render: (w) => w.lifetimeEarned,
    },
    {
      key: 'redeemed',
      header: 'Lifetime redeemed',
      align: 'right',
      nowrap: true,
      render: (w) => w.lifetimeRedeemed,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (w) => (
        <ActionMenu label={`Actions for ${w.name}`}>
          <MenuItem icon={<History size={ICON_SIZE.menu} />} onSelect={() => setHistoryFor(w)}>
            View history
          </MenuItem>
          <MenuItem icon={<Gift size={ICON_SIZE.menu} />} onSelect={() => setGrantFor(w)}>
            Grant / revoke points
          </MenuItem>
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <p className="panel-lead">
        Every parent’s Care Points wallet. Open a row’s menu to view its full grant/redemption
        history or manually adjust the balance.
      </p>

      <div className="filter-bar">
        <Input
          type="search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search wallets"
        />
      </div>

      {isLoading && <TableSkeleton columns={6} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {filtered && (
        <Table
          columns={columns}
          rows={filtered}
          rowKey={(w) => w.userId}
          empty={search ? 'No parents match your search.' : 'No parent wallets yet.'}
        />
      )}

      {historyFor && (
        <WalletHistoryModal wallet={historyFor} onClose={() => setHistoryFor(null)} />
      )}
      {grantFor && <GrantPointsModal wallet={grantFor} onClose={() => setGrantFor(null)} />}
    </>
  );
}
