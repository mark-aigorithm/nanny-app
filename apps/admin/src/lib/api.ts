import type {
  AdminBooking,
  AdminBookingStatusFilter,
  AdminNanny,
  AdminNannyStatusFilter,
  AdminUser,
  Camera,
  CreateAdminInput,
  CreateCameraInput,
  CreatePromoCodeInput,
  CreateSkillInput,
  NannyOption,
  PlatformConfig,
  PromoCode,
  SetBookingStatusInput,
  SetNannySkillsInput,
  Skill,
  UpdateCameraInput,
  UpdatePlatformConfigInput,
  UpdatePromoCodeInput,
  UpdateSkillInput,
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

export async function fetchSkills(): Promise<Skill[]> {
  const res = await apiClient.get<ApiEnvelope<Skill[]>>('/admin/skills');
  return res.data.data;
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const res = await apiClient.post<ApiEnvelope<Skill>>('/admin/skills', input);
  return res.data.data;
}

export async function updateSkill(id: string, input: UpdateSkillInput): Promise<Skill> {
  const res = await apiClient.patch<ApiEnvelope<Skill>>(`/admin/skills/${id}`, input);
  return res.data.data;
}

export async function deleteSkill(id: string): Promise<void> {
  await apiClient.delete(`/admin/skills/${id}`);
}

export async function setNannySkills(
  id: string,
  input: SetNannySkillsInput,
): Promise<AdminNanny> {
  const res = await apiClient.put<ApiEnvelope<AdminNanny>>(
    `/admin/nannies/${id}/skills`,
    input,
  );
  return res.data.data;
}

export async function fetchCameras(): Promise<Camera[]> {
  const res = await apiClient.get<ApiEnvelope<Camera[]>>('/admin/cameras');
  return res.data.data;
}

export async function fetchNannyOptions(): Promise<NannyOption[]> {
  const res = await apiClient.get<ApiEnvelope<NannyOption[]>>(
    '/admin/cameras/nanny-options',
  );
  return res.data.data;
}

export async function createCamera(input: CreateCameraInput): Promise<Camera> {
  const res = await apiClient.post<ApiEnvelope<Camera>>('/admin/cameras', input);
  return res.data.data;
}

export async function updateCamera(
  id: string,
  input: UpdateCameraInput,
): Promise<Camera> {
  const res = await apiClient.patch<ApiEnvelope<Camera>>(`/admin/cameras/${id}`, input);
  return res.data.data;
}

export async function deleteCamera(id: string): Promise<void> {
  await apiClient.delete(`/admin/cameras/${id}`);
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

export async function fetchBookings(
  status: AdminBookingStatusFilter,
): Promise<AdminBooking[]> {
  const res = await apiClient.get<ApiEnvelope<AdminBooking[]>>('/admin/bookings', {
    params: { status },
  });
  return res.data.data;
}

export async function approveBooking(id: string): Promise<AdminBooking> {
  const res = await apiClient.post<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/approve`,
  );
  return res.data.data;
}

export async function rejectBooking(id: string, reason?: string): Promise<AdminBooking> {
  const res = await apiClient.post<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/reject`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function setBookingStatus(
  id: string,
  status: SetBookingStatusInput['status'],
): Promise<AdminBooking> {
  const res = await apiClient.patch<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/status`,
    { status },
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
