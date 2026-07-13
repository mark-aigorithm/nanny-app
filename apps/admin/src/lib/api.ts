import type {
  AdminBooking,
  AdminBookingDetail,
  AdminBookingStatusFilter,
  AdminListQuery,
  AdminMother,
  AdminNanny,
  AdminNannyDetail,
  AdminNannyStatusFilter,
  AdminUser,
  Camera,
  CreateAdminInput,
  CreateCameraInput,
  CreateDurationRuleInput,
  CreatePromoCodeInput,
  CreateSkillInput,
  DurationRule,
  GrantPointsInput,
  NannyOption,
  PlatformConfig,
  PaginationMeta,
  PriceBreakdown,
  PricePreviewInput,
  PromoCode,
  RewardConfig,
  RewardLedgerEntry,
  RewardWalletSummary,
  SetBookingStatusInput,
  SetNannySkillsInput,
  Skill,
  UpdateBookingTimesInput,
  UpdateCameraInput,
  UpdateDurationRuleInput,
  UpdatePlatformConfigInput,
  UpdatePromoCodeInput,
  UpdateRewardConfigInput,
  UpdateSkillInput,
} from '@nanny-app/shared';

import { apiClient } from './api-client';

type ApiEnvelope<T> = { data: T; error: string | null };
type PagedEnvelope<T> = { data: T; error: string | null; meta: PaginationMeta };

/** A page of records plus its pagination metadata. */
export type Paged<T> = { data: T; meta: PaginationMeta };

// ── Care Points (rewards) ──────────────────────────────────────

export async function fetchRewardConfig(): Promise<RewardConfig> {
  const res = await apiClient.get<ApiEnvelope<RewardConfig>>('/admin/rewards/config');
  return res.data.data;
}

export async function updateRewardConfig(
  input: UpdateRewardConfigInput,
): Promise<RewardConfig> {
  const res = await apiClient.put<ApiEnvelope<RewardConfig>>('/admin/rewards/config', input);
  return res.data.data;
}

export async function fetchRewardWallets(
  { page, limit, search }: { page: number; limit: number; search?: string },
): Promise<Paged<RewardWalletSummary[]>> {
  const res = await apiClient.get<PagedEnvelope<RewardWalletSummary[]>>('/admin/rewards/wallets', {
    params: { page, limit, ...(search ? { search } : {}) },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchWalletHistory(userId: string): Promise<RewardLedgerEntry[]> {
  const res = await apiClient.get<ApiEnvelope<RewardLedgerEntry[]>>(
    `/admin/rewards/wallets/${userId}/history`,
    { params: { page: 1, limit: 50 } },
  );
  return res.data.data;
}

export async function grantWalletPoints(
  userId: string,
  input: GrantPointsInput,
): Promise<RewardWalletSummary> {
  const res = await apiClient.post<ApiEnvelope<RewardWalletSummary>>(
    `/admin/rewards/wallets/${userId}/grant`,
    input,
  );
  return res.data.data;
}

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

// ── Duration multiplier rules ──────────────────────────────────

export async function fetchDurationRules(): Promise<DurationRule[]> {
  const res = await apiClient.get<ApiEnvelope<DurationRule[]>>('/admin/duration-rules');
  return res.data.data;
}

export async function createDurationRule(
  input: CreateDurationRuleInput,
): Promise<DurationRule> {
  const res = await apiClient.post<ApiEnvelope<DurationRule>>('/admin/duration-rules', input);
  return res.data.data;
}

export async function updateDurationRule(
  id: string,
  input: UpdateDurationRuleInput,
): Promise<DurationRule> {
  const res = await apiClient.patch<ApiEnvelope<DurationRule>>(
    `/admin/duration-rules/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteDurationRule(id: string): Promise<void> {
  await apiClient.delete(`/admin/duration-rules/${id}`);
}

// ── Pricing calculator (authoritative preview) ─────────────────

export async function calculatePricePreview(
  input: PricePreviewInput,
): Promise<PriceBreakdown> {
  const res = await apiClient.post<ApiEnvelope<PriceBreakdown>>(
    '/admin/pricing/calculate',
    input,
  );
  return res.data.data;
}

export async function fetchBookings(
  status: AdminBookingStatusFilter,
  { page, limit }: AdminListQuery,
): Promise<Paged<AdminBooking[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminBooking[]>>('/admin/bookings', {
    params: { status, page, limit },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchBooking(id: string): Promise<AdminBookingDetail> {
  const res = await apiClient.get<ApiEnvelope<AdminBookingDetail>>(`/admin/bookings/${id}`);
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

export async function updateBookingTimes(
  id: string,
  input: UpdateBookingTimesInput,
): Promise<AdminBooking> {
  const res = await apiClient.patch<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/times`,
    input,
  );
  return res.data.data;
}

export async function fetchNannies(
  status: AdminNannyStatusFilter,
  { page, limit }: AdminListQuery,
): Promise<Paged<AdminNanny[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminNanny[]>>('/admin/nannies', {
    params: { status, page, limit },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchNanny(id: string): Promise<AdminNannyDetail> {
  const res = await apiClient.get<ApiEnvelope<AdminNannyDetail>>(`/admin/nannies/${id}`);
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

export async function fetchMothers(
  { page, limit }: AdminListQuery,
): Promise<Paged<AdminMother[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminMother[]>>('/admin/mothers', {
    params: { page, limit },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchMother(id: string): Promise<AdminMother> {
  const res = await apiClient.get<ApiEnvelope<AdminMother>>(`/admin/mothers/${id}`);
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
