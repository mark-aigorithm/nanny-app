import type {
  AdminBooking,
  AdminBookingStatusFilter,
  AdminNanny,
  AdminNannyStatusFilter,
  AdminUser,
  CreateAdminInput,
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

export async function fetchAdminMe(): Promise<AdminUser> {
  const res = await apiClient.get<ApiEnvelope<AdminUser>>('/admin/me');
  return res.data.data;
}

export async function fetchReservations(
  status: AdminBookingStatusFilter,
): Promise<AdminBooking[]> {
  const res = await apiClient.get<ApiEnvelope<AdminBooking[]>>('/admin/bookings', {
    params: { status },
  });
  return res.data.data;
}

export async function confirmReservation(id: string): Promise<AdminBooking> {
  const res = await apiClient.post<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/confirm`,
  );
  return res.data.data;
}

export async function fetchNannies(
  status: AdminNannyStatusFilter,
): Promise<AdminNanny[]> {
  const res = await apiClient.get<ApiEnvelope<AdminNanny[]>>('/admin/nannies', {
    params: { status },
  });
  return res.data.data;
}

export async function approveNanny(id: string): Promise<AdminNanny> {
  const res = await apiClient.post<ApiEnvelope<AdminNanny>>(
    `/admin/nannies/${id}/approve`,
  );
  return res.data.data;
}

export async function rejectNanny(id: string, reason?: string): Promise<AdminNanny> {
  const res = await apiClient.post<ApiEnvelope<AdminNanny>>(
    `/admin/nannies/${id}/reject`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function fetchAdmins(): Promise<AdminUser[]> {
  const res = await apiClient.get<ApiEnvelope<AdminUser[]>>('/admin/admins');
  return res.data.data;
}

export async function createAdmin(input: CreateAdminInput): Promise<AdminUser> {
  const res = await apiClient.post<ApiEnvelope<AdminUser>>('/admin/admins', input);
  return res.data.data;
}
