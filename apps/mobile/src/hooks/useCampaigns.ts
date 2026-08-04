import type { PublicCampaign } from '@nanny-app/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const CAMPAIGNS_KEY = 'campaigns';

export function useActiveCampaigns() {
  return useQuery({
    queryKey: [CAMPAIGNS_KEY, 'list'],
    queryFn: () => unwrap<PublicCampaign[]>(api.get('/campaigns')),
    staleTime: 60_000,
  });
}

export function useTrackImpression() {
  return useMutation<unknown, Error, number>({
    mutationFn: (campaignId) => unwrap(api.post(`/campaigns/${campaignId}/impression`)),
  });
}

export function useTrackClick() {
  return useMutation<unknown, Error, number>({
    mutationFn: (campaignId) => unwrap(api.post(`/campaigns/${campaignId}/click`)),
  });
}
