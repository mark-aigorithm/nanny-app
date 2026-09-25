import { useQuery } from '@tanstack/react-query';
import type { LegalDocument, LegalDocumentKey, SupportContact, SupportFaq } from '@nanny-app/shared';

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

/**
 * The Terms of Service or Privacy Policy, as the operators wrote them. Public:
 * the registration wizard opens these before the user has an account.
 */
export function useLegalDocument(key: LegalDocumentKey) {
  return useQuery({
    queryKey: [SUPPORT_KEY, 'legal', key],
    queryFn: () => unwrap<LegalDocument>(api.get(`/legal/${key}`)),
    staleTime: 5 * 60_000,
  });
}
