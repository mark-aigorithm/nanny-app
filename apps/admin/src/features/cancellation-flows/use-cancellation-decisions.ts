import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CancellationDecisionsState, SetCancellationDecisionInput } from '@nanny-app/shared';

import {
  clearCancellationDecision,
  fetchCancellationDecisions,
  setCancellationDecision,
} from '@admin/lib/api';

export const CANCELLATION_DECISIONS_KEY = ['cancellation-decisions'] as const;

export function useCancellationDecisions() {
  return useQuery({
    queryKey: CANCELLATION_DECISIONS_KEY,
    queryFn: fetchCancellationDecisions,
    // Several people may be deciding from the same link at once.
    staleTime: 5_000,
    // A 404 means recording is switched off on this server — retrying won't change that.
    retry: false,
  });
}

/** Records one decision. Re-reads afterwards so the server's timestamp and anyone else's answers show. */
export function useSetCancellationDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ decisionId, input }: { decisionId: string; input: SetCancellationDecisionInput }) =>
      setCancellationDecision(decisionId, input),
    onSuccess: (entry, { decisionId }) => {
      queryClient.setQueryData<CancellationDecisionsState>(CANCELLATION_DECISIONS_KEY, (current) => ({
        entries: { ...(current?.entries ?? {}), [decisionId]: entry },
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CANCELLATION_DECISIONS_KEY });
    },
  });
}

export function useClearCancellationDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (decisionId: string) => clearCancellationDecision(decisionId),
    onSuccess: (_result, decisionId) => {
      queryClient.setQueryData<CancellationDecisionsState>(CANCELLATION_DECISIONS_KEY, (current) => {
        const entries = { ...(current?.entries ?? {}) };
        delete entries[decisionId];
        return { entries };
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CANCELLATION_DECISIONS_KEY });
    },
  });
}
