import { useQuery } from '@tanstack/react-query';
import type { SupportContact, SupportFaq } from '@nanny-app/shared';

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

/**
 * The FAQ the operators maintain in the console. Read once per session like the
 * channels: it changes rarely and a stale answer for five minutes is harmless.
 */
export function useSupportFaq() {
  return useQuery({
    queryKey: [SUPPORT_KEY, 'faq'],
    queryFn: () => unwrap<SupportFaq>(api.get('/support/faq')),
    staleTime: 5 * 60_000,
  });
}
