import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RedeemReferralResponse,
  ReferralSummary,
  ValidateReferralCodeResponse,
} from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

const REFERRALS_KEY = 'referrals';

/** Code, share text, payout amounts and invite list for the Refer a friend screen. */
export function useReferralSummary() {
  return useQuery({
    queryKey: [REFERRALS_KEY, 'me'],
    queryFn: () => unwrap<ReferralSummary>(api.get('/referrals/me')),
  });
}

/**
 * Checks a code before it is submitted, so the signup field can confirm who
 * invited the user. Disabled until a code is actually entered.
 */
export function useValidateReferralCode(code: string) {
  const trimmed = code.trim();
  return useQuery({
    queryKey: [REFERRALS_KEY, 'validate', trimmed.toUpperCase()],
    queryFn: () =>
      unwrap<ValidateReferralCodeResponse>(
        api.get('/referrals/validate', { params: { code: trimmed } }),
      ),
    enabled: trimmed.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Redeems a referral code. Invalidates rewards too, since a successful redeem
 * credits the invitee's wallet straight away.
 */
export function useRedeemReferralCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      unwrap<RedeemReferralResponse>(api.post('/referrals/redeem', { code })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REFERRALS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['rewards'] });
    },
  });
}
