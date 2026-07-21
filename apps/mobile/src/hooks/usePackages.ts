import type { PackageHoursBalance, PublicPackage, PaymentStatus } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const PACKAGES_KEY = 'packages';
export const PACKAGE_HOURS_KEY = 'package-hours';

export type PackageCheckoutSession = {
  paymentId: number; clientSecret: string; publicKey: string; intentionId: string;
};

export function usePackages() {
  return useQuery({
    queryKey: [PACKAGES_KEY, 'list'],
    queryFn: () => unwrap<PublicPackage[]>(api.get('/packages')),
  });
}

export function usePackageHours() {
  return useQuery({
    queryKey: [PACKAGE_HOURS_KEY],
    queryFn: () => unwrap<PackageHoursBalance>(api.get('/packages/me/hours')),
  });
}

export function usePurchasePackage() {
  const qc = useQueryClient();
  return useMutation<PackageCheckoutSession, Error, { packageId: number }>({
    mutationFn: ({ packageId }) =>
      unwrap(api.post(`/packages/${packageId}/purchase`, { packageId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PACKAGE_HOURS_KEY] }),
  });
}

export function useSyncPackagePayment() {
  const qc = useQueryClient();
  return useMutation<{ status: PaymentStatus }, Error, { purchaseId: number }>({
    mutationFn: ({ purchaseId }) =>
      unwrap<{ status: PaymentStatus }>(api.post(`/packages/purchases/${purchaseId}/sync`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PACKAGE_HOURS_KEY] }),
  });
}
