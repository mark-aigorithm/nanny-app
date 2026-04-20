import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AvailabilityType,
  CreateReviewRequest,
  NannyDashboard,
  NannyListItem,
  NannyPublicProfile,
  ReviewSummary,
} from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

const NANNIES_KEY = 'nannies';

export function useNannyList(availabilityType?: AvailabilityType) {
  return useQuery<NannyListItem[]>({
    queryKey: [NANNIES_KEY, availabilityType],
    queryFn: () =>
      unwrap(
        api.get('/nanny/nannies', {
          params: availabilityType ? { availabilityType } : undefined,
        }),
      ),
  });
}

export function useNannyPublicProfile(nannyProfileId: string | undefined) {
  return useQuery<NannyPublicProfile>({
    queryKey: [NANNIES_KEY, nannyProfileId],
    queryFn: () => unwrap(api.get(`/nanny/nannies/${nannyProfileId}`)),
    enabled: !!nannyProfileId,
  });
}

export function useNannyBookedSlots(nannyProfileId: string | undefined, date: string | null) {
  return useQuery<string[]>({
    queryKey: [NANNIES_KEY, nannyProfileId, 'booked-slots', date],
    queryFn: () => unwrap(api.get(`/nanny/nannies/${nannyProfileId}/booked-slots`, { params: { date } })),
    enabled: !!nannyProfileId && !!date,
  });
}

export function useNannyDashboard() {
  return useQuery<NannyDashboard>({
    queryKey: [NANNIES_KEY, 'dashboard'],
    queryFn: () => unwrap(api.get('/nanny/dashboard')),
  });
}

export function useCreateReview(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<ReviewSummary, Error, CreateReviewRequest>({
    mutationFn: (body) =>
      unwrap(api.post(`/nanny/bookings/${bookingId}/review`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NANNIES_KEY] });
    },
  });
}
