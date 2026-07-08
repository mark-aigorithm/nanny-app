import type {
  CreatePromoCodeInput,
  PlatformConfig,
  PromoCode,
  UpdatePlatformConfigInput,
  UpdatePromoCodeInput,
} from '@nanny-app/shared';

import { apiClient } from './api-client';

type ApiEnvelope<T> = { data: T; error: string | null };

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  const res = await apiClient.get<ApiEnvelope<PromoCode[]>>('/admin/promo-codes');
  return res.data.data;
}

export async function createPromoCode(input: CreatePromoCodeInput): Promise<PromoCode> {
  const res = await apiClient.post<ApiEnvelope<PromoCode>>('/admin/promo-codes', input);
  return res.data.data;
}

export async function updatePromoCode(
  id: string,
  input: UpdatePromoCodeInput,
): Promise<PromoCode> {
  const res = await apiClient.patch<ApiEnvelope<PromoCode>>(
    `/admin/promo-codes/${id}`,
    input,
  );
  return res.data.data;
}

export async function deletePromoCode(id: string): Promise<void> {
  await apiClient.delete(`/admin/promo-codes/${id}`);
}

export async function fetchPlatformConfig(): Promise<PlatformConfig> {
  const res = await apiClient.get<ApiEnvelope<PlatformConfig>>('/admin/config');
  return res.data.data;
}

export async function updatePlatformConfig(
  input: UpdatePlatformConfigInput,
): Promise<PlatformConfig> {
  const res = await apiClient.put<ApiEnvelope<PlatformConfig>>('/admin/config', input);
  return res.data.data;
}
