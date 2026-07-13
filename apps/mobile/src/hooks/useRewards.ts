import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type {
  PaginationMeta,
  RewardConfig,
  RewardLedgerEntry,
  RewardWallet,
} from '@nanny-app/shared';

import { api, unwrap, unwrapPaginated } from '@mobile/lib/api';

const REWARDS_KEY = 'rewards';

/** The signed-in parent's Care Points wallet (balance + free-hour credit). */
export function useRewardWallet() {
  return useQuery({
    queryKey: [REWARDS_KEY, 'wallet'],
    queryFn: () => unwrap<RewardWallet>(api.get('/rewards/wallet')),
  });
}

/** Program rates, so the UI can show the earn/redeem conversion. */
export function useRewardConfig() {
  return useQuery({
    queryKey: [REWARDS_KEY, 'config'],
    queryFn: () => unwrap<RewardConfig>(api.get('/rewards/config')),
    staleTime: 5 * 60_000,
  });
}

type HistoryPage = {
  entries: RewardLedgerEntry[];
  meta: PaginationMeta;
};

/** Paginated grant/redemption history for the signed-in parent. */
export function useRewardHistory(limit = 20) {
  return useInfiniteQuery<HistoryPage>({
    queryKey: [REWARDS_KEY, 'history', limit],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { items, meta } = await unwrapPaginated<RewardLedgerEntry[], PaginationMeta>(
        api.get('/rewards/history', { params: { page: pageParam as number, limit } }),
      );
      return { entries: items, meta };
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });
}
