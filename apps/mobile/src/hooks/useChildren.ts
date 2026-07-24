import type { BookingChild, Child } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const CHILDREN_KEY = 'children';

/** The mother's saved children, used to prefill the booking sheet. */
export function useSavedChildren() {
  return useQuery({
    queryKey: [CHILDREN_KEY],
    queryFn: () => unwrap<Child[]>(api.get('/auth/children')),
  });
}

/**
 * Replaces the saved set. PUT, not POST — the body is the complete new family,
 * which is what the sheet's "save for next booking" toggle means.
 */
export function useSaveChildren() {
  const qc = useQueryClient();
  return useMutation<Child[], Error, BookingChild[]>({
    mutationFn: (children) => unwrap<Child[]>(api.put('/auth/children', { children })),
    onSuccess: (saved) => qc.setQueryData([CHILDREN_KEY], saved),
  });
}
