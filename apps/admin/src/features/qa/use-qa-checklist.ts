import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { QaChecklistState, SetQaScenarioStatusInput } from '@nanny-app/shared';

import { fetchQaChecklist, resetQaChecklist, setQaScenarioStatus } from '@admin/lib/api';

export const QA_CHECKLIST_KEY = ['qa-checklist'] as const;

export function useQaChecklist() {
  return useQuery({
    queryKey: QA_CHECKLIST_KEY,
    queryFn: fetchQaChecklist,
    // The checklist is walked by several people at once during a release
    // round, so a stale copy is more misleading here than elsewhere.
    staleTime: 5_000,
  });
}

/**
 * Records one result, applied optimistically.
 *
 * The optimism matters more than usual: a tester is walking a hundred rows on a
 * phone or a laptop beside the device under test, and a row that only ticks
 * after a round-trip reads as a dropped tap and gets tapped again. On failure
 * the previous state is put back and the caller reports it through a toast.
 */
export function useSetQaScenarioStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      scenarioId,
      input,
    }: {
      scenarioId: string;
      input: SetQaScenarioStatusInput;
    }) => setQaScenarioStatus(scenarioId, input),

    onMutate: async ({ scenarioId, input }) => {
      await queryClient.cancelQueries({ queryKey: QA_CHECKLIST_KEY });
      const previous = queryClient.getQueryData<QaChecklistState>(QA_CHECKLIST_KEY);

      queryClient.setQueryData<QaChecklistState>(QA_CHECKLIST_KEY, (current) => ({
        entries: {
          ...(current?.entries ?? {}),
          [scenarioId]: {
            status: input.status,
            note: input.note ?? '',
            tester: input.tester ?? '',
            updatedAt: new Date().toISOString(),
          },
        },
      }));

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QA_CHECKLIST_KEY, context.previous);
      }
    },

    // Always re-read: another tester may have recorded something while this
    // write was in flight, and the server's timestamp is the authoritative one.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QA_CHECKLIST_KEY });
    },
  });
}

export function useResetQaChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resetQaChecklist,
    onSuccess: () => {
      queryClient.setQueryData<QaChecklistState>(QA_CHECKLIST_KEY, { entries: {} });
      void queryClient.invalidateQueries({ queryKey: QA_CHECKLIST_KEY });
    },
  });
}
