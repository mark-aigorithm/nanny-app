import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateReviewRequest,
  NannyDashboard,
  PublicCertification,
  PublicSkill,
  ReviewSummary,
} from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';

/**
 * Nanny-facing queries plus the catalogs the parent app still needs.
 *
 * There are deliberately no browse/profile/slot hooks here: care is broadcast
 * to the whole eligible pool and the first nanny to accept claims the request,
 * so the parent never picks a nanny. `GET /nanny/nannies`, `/nannies/:id` and
 * `/nannies/:id/booked-slots` still exist on the backend, but nothing in this
 * repo calls them — don't re-add client hooks without a screen to use them.
 */
export const NANNIES_KEY = 'nannies';
export const SKILLS_KEY = 'skills';
export const CERTIFICATIONS_KEY = 'certifications';

/** Active skill catalog — powers the nanny registration skill picker. */
export function useSkillCatalog() {
  return useQuery<PublicSkill[]>({
    queryKey: [SKILLS_KEY, 'catalog'],
    queryFn: () => unwrap(api.get('/nanny/skills')),
  });
}

/** Active certification catalog — powers the nanny profile self-service picker. */
export function useCertificationCatalog() {
  return useQuery<PublicCertification[]>({
    queryKey: [CERTIFICATIONS_KEY, 'catalog'],
    queryFn: () => unwrap(api.get('/nanny/certifications')),
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

export function useCreateReview(bookingId: number) {
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
