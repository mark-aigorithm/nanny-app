import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CareLogResponse, CreateCareLogRequest } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

const CARE_LOGS_KEY = 'care-logs';

export function useCareLogs(bookingId: number | undefined) {
  return useQuery<CareLogResponse[]>({
    queryKey: [CARE_LOGS_KEY, bookingId],
    queryFn: () => unwrap(api.get(`/bookings/${bookingId}/care-logs`)),
    enabled: !!bookingId,
  });
}

export function useCreateCareLog(bookingId: number | undefined) {
  const qc = useQueryClient();
  return useMutation<CareLogResponse, Error, CreateCareLogRequest>({
    mutationFn: (body) =>
      unwrap(api.post(`/bookings/${bookingId}/care-logs`, body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CARE_LOGS_KEY, bookingId] }),
  });
}
