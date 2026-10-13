import type { Child, ChildInput } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const CHILDREN_KEY = 'children';

/**
 * The mother's children (Profile → Children), oldest entry first. The booking
 * flow picks from this list, and every mutation below writes the server's
 * answer into the same cache, so the picker and the Children screen agree.
 */
export function useChildren() {
  return useQuery({
    queryKey: [CHILDREN_KEY],
    queryFn: () => unwrap<Child[]>(api.get('/children')),
  });
}

/** Adds a child; resolves with the saved child so the picker can tick it. */
export function useCreateChild() {
  const qc = useQueryClient();
  return useMutation<Child, Error, ChildInput>({
    mutationFn: (input) => unwrap<Child>(api.post('/children', input)),
    onSuccess: (created) =>
      qc.setQueryData<Child[]>([CHILDREN_KEY], (current = []) => [...current, created]),
  });
}

/** Replaces one child's details. Bookings already made keep their own copy. */
export function useUpdateChild() {
  const qc = useQueryClient();
  return useMutation<Child, Error, { id: number; input: ChildInput }>({
    mutationFn: ({ id, input }) => unwrap<Child>(api.put(`/children/${id}`, input)),
    onSuccess: (updated) =>
      qc.setQueryData<Child[]>([CHILDREN_KEY], (current = []) =>
        current.map((c) => (c.id === updated.id ? updated : c)),
      ),
  });
}

/** Removes a child; the server answers with the children left. */
export function useDeleteChild() {
  const qc = useQueryClient();
  return useMutation<Child[], Error, number>({
    mutationFn: (id) => unwrap<Child[]>(api.delete(`/children/${id}`)),
    onSuccess: (list) => qc.setQueryData([CHILDREN_KEY], list),
  });
}
