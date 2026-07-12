import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AvailabilityType,
  CreateReviewRequest,
  NannyDashboard,
  NannyListItem,
  NannyPublicProfile,
  PublicSkill,
  ReviewSummary,
} from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';

export const NANNIES_KEY = 'nannies';
export const SKILLS_KEY = 'skills';

interface NannyListParams {
  availabilityType?: AvailabilityType;
  name?: string;
  skillId?: string;
  /** Caller coordinates — when both are set, results come back closest first, then highest-rated. */
  latitude?: number;
  longitude?: number;
}

export function useNannyList(params?: NannyListParams) {
  return useQuery<NannyListItem[]>({
    queryKey: [NANNIES_KEY, 'list', params],
    queryFn: () => {
      const queryParams: Record<string, string> = {};
      if (params?.availabilityType) queryParams['availabilityType'] = params.availabilityType;
      if (params?.name) queryParams['name'] = params.name;
      if (params?.skillId) queryParams['skillId'] = params.skillId;
      if (params?.latitude !== undefined && params?.longitude !== undefined) {
        queryParams['latitude'] = String(params.latitude);
        queryParams['longitude'] = String(params.longitude);
      }
      return unwrap(api.get('/nanny/nannies', { params: Object.keys(queryParams).length ? queryParams : undefined }));
    },
  });
}

/** Active skill catalog — powers the search filter chips. */
export function useSkillCatalog() {
  return useQuery<PublicSkill[]>({
    queryKey: [SKILLS_KEY, 'catalog'],
    queryFn: () => unwrap(api.get('/nanny/skills')),
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
  const firebaseUser = useAuthStore((s) => s.user);
  return useQuery<NannyDashboard>({
    queryKey: [NANNIES_KEY, 'dashboard', firebaseUser?.uid],
    queryFn: () => unwrap(api.get('/nanny/dashboard')),
    enabled: !!firebaseUser,
  });
}

export function useCreateReview(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<ReviewSummary, Error, CreateReviewRequest>({
    mutationFn: (body) =>
      unwrap(api.post(`/nanny/bookings/${bookingId}/review`, body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NANNIES_KEY] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
