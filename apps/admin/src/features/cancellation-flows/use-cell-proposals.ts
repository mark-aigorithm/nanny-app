import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancellationCellKey,
  type CancellationCellProposalsState,
  type CancellationFlowId,
  type CancellationOutcomeKey,
  type SetCancellationCellProposalInput,
} from '@nanny-app/shared';

import {
  clearCancellationCellProposal,
  fetchCancellationCellProposals,
  setCancellationCellProposal,
} from '@admin/lib/api';

export const CANCELLATION_CELL_PROPOSALS_KEY = ['cancellation-cell-proposals'] as const;

export type CellRef = { flowId: CancellationFlowId; outcome: CancellationOutcomeKey };

export function useCellProposals() {
  return useQuery({
    queryKey: CANCELLATION_CELL_PROPOSALS_KEY,
    queryFn: fetchCancellationCellProposals,
    // Several people may be editing the table from the same link at once.
    staleTime: 5_000,
    // A 404 means recording is switched off on this server — retrying won't change that.
    retry: false,
  });
}

/** Records one cell's proposal. Re-reads afterwards so the server's timestamp and anyone else's changes show. */
export function useSetCellProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cell, input }: { cell: CellRef; input: SetCancellationCellProposalInput }) =>
      setCancellationCellProposal(cell.flowId, cell.outcome, input),
    onSuccess: (proposal, { cell }) => {
      queryClient.setQueryData<CancellationCellProposalsState>(
        CANCELLATION_CELL_PROPOSALS_KEY,
        (current) => ({
          entries: { ...(current?.entries ?? {}), [cancellationCellKey(cell.flowId, cell.outcome)]: proposal },
        }),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CANCELLATION_CELL_PROPOSALS_KEY });
    },
  });
}

/** Puts a cell back to what happens today. */
export function useClearCellProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cell: CellRef) => clearCancellationCellProposal(cell.flowId, cell.outcome),
    onSuccess: (_result, cell) => {
      queryClient.setQueryData<CancellationCellProposalsState>(
        CANCELLATION_CELL_PROPOSALS_KEY,
        (current) => {
          const entries = { ...(current?.entries ?? {}) };
          delete entries[cancellationCellKey(cell.flowId, cell.outcome)];
          return { entries };
        },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CANCELLATION_CELL_PROPOSALS_KEY });
    },
  });
}
