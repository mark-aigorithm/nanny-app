import { useQuery } from '@tanstack/react-query';
import type { SupportContact } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

const SUPPORT_KEY = 'support';

/**
 * Admin-configured support channels. Any field may be an empty string,
 * meaning that channel is switched off and its card should not render.
 */
export function useSupportContact() {
  return useQuery({
    queryKey: [SUPPORT_KEY, 'contact'],
    queryFn: () => unwrap<SupportContact>(api.get('/support/contact')),
    staleTime: 5 * 60_000,
  });
}
