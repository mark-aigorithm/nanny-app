import type {
  AdminSurvey,
  AdminSurveyRecipient,
  AdminSurveyRecipientAnswers,
  AdminSurveyRecipientSortKey,
  AdminSurveySortKey,
  AdminSurveySummary,
  AdminSortDir,
  MotherPickerRow,
  MotherPickerSortKey,
  SurveyDraftInput,
  SurveyRecipientStatus,
  SurveyResendInput,
  SurveyResults,
  SurveySendResult,
  SurveyStatus,
  SurveyTargetInput,
  SurveyTextAnswer,
  UserGroup,
  UserGroupInput,
  Address,
  AdminUpsertNannyAddressInput,
  AdminBooking,
  AdminBookingCandidate,
  AdminBookingDetail,
  AdminBookingEditContext,
  AdminBookingSortKey,
  AdminBookingStatusFilter,
  AdminEditBookingInput,
  AdminEditBookingCommitInput,
  AdminEditCommitResponse,
  AdminEditPreviewResponse,
  AdminRefundBookingInput,
  AdminRefundResponse,
  AdminIdReview,
  AdminApprovalStatusFilter,
  AdminCommunityPost,
  AdminCommunitySortKey,
  AdminCommunityStatusFilter,
  AdminCommunityTypeFilter,
  AdminColumnSort,
  AdminListQuery,
  AdminMother,
  AdminMotherDetail,
  AdminNanny,
  AdminNannyCamera,
  AdminNannySortKey,
  AdminNannyDetail,
  AdminPackagePurchase,
  AdminPackagePurchaseDetail,
  AdminPackagePurchaseListQuery,
  AdminSortOrder,
  AdminUser,
  AdminUserSortKey,
  BookingMessageListResponse,
  Camera,
  Campaign,
  AppRelease,
  Certification,
  CreateAdminInput,
  CreateCameraInput,
  CreateCampaignInput,
  CreateAppReleaseInput,
  CreateCertificationInput,
  CreateDurationRuleInput,
  CreateOfficialPostInput,
  CreatePromoCodeInput,
  CreateServiceAreaInput,
  CreateSkillInput,
  DurationRule,
  GrantPointsInput,
  MotherPin,
  NannyOption,
  Package,
  CreatePackageInput,
  UpdatePackageInput,
  PlatformConfig,
  PaginationMeta,
  PriceBreakdown,
  PricePreviewInput,
  PromoCode,
  CancellationCellProposal,
  CancellationCellProposalsState,
  CancellationFlowId,
  CancellationOutcomeKey,
  QaChecklistEntry,
  QaChecklistState,
  RewardConfig,
  RewardLedgerEntry,
  RewardWalletSortKey,
  RewardWalletSummary,
  SetBookingStatusInput,
  ServiceArea,
  ServiceAreaLookup,
  ServiceAreaSettings,
  SetNannySkillsInput,
  SetCancellationCellProposalInput,
  SetQaScenarioStatusInput,
  Skill,
  SupportContact,
  SupportFaq,
  LegalDocument,
  LegalDocumentKey,
  LegalDocuments,
  UpdateLegalDocumentInput,
  UpdateAdminMotherInput,
  UpdateAdminNanny,
  UpdateAdminUserInput,
  UpdateBookingTimesInput,
  UpdateCameraInput,
  UpdateCampaignInput,
  UpdateAppReleaseInput,
  UpdateCertificationInput,
  UpdateDurationRuleInput,
  UpdateOfficialPostInput,
  UpdatePlatformConfigInput,
  UpdatePromoCodeInput,
  UpdateRewardConfigInput,
  UpdateServiceAreaInput,
  UpdateSkillInput,
  UpdateSupportContactInput,
} from '@nanny-app/shared';

import { apiClient } from './api-client';

type ApiEnvelope<T> = { data: T; error: string | null };
type PagedEnvelope<T> = { data: T; error: string | null; meta: PaginationMeta };

/** A page of records plus its pagination metadata. */
export type Paged<T> = { data: T; meta: PaginationMeta };

/**
 * Page/limit for a list that also offers a sort control. `sort` is optional so
 * callers that only want a count (the dashboard, the notification bell) keep
 * the endpoint's own default.
 */
type SortableListQuery = AdminListQuery & { sort?: AdminSortOrder };

/**
 * Page/limit for a directory sorted by column header. The sort is optional for
 * the same reason as above.
 */
type ColumnSortedListQuery<K extends string> = AdminListQuery & Partial<AdminColumnSort<K>>;

// ── Care Points (rewards) ──────────────────────────────────────

export async function fetchRewardConfig(): Promise<RewardConfig> {
  const res = await apiClient.get<ApiEnvelope<RewardConfig>>('/admin/rewards/config');
  return res.data.data;
}

export async function updateRewardConfig(input: UpdateRewardConfigInput): Promise<RewardConfig> {
  const res = await apiClient.put<ApiEnvelope<RewardConfig>>('/admin/rewards/config', input);
  return res.data.data;
}

export async function fetchRewardWallets({
  page,
  limit,
  search,
  sortBy,
  sortDir,
}: ColumnSortedListQuery<RewardWalletSortKey> & { search?: string }): Promise<
  Paged<RewardWalletSummary[]>
> {
  const res = await apiClient.get<PagedEnvelope<RewardWalletSummary[]>>('/admin/rewards/wallets', {
    params: { page, limit, ...(search ? { search } : {}), sortBy, sortDir },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchWalletHistory(userId: number): Promise<RewardLedgerEntry[]> {
  const res = await apiClient.get<ApiEnvelope<RewardLedgerEntry[]>>(
    `/admin/rewards/wallets/${userId}/history`,
    { params: { page: 1, limit: 50 } },
  );
  return res.data.data;
}

export async function grantWalletPoints(
  userId: number,
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

export async function updatePromoCode(id: number, input: UpdatePromoCodeInput): Promise<PromoCode> {
  const res = await apiClient.patch<ApiEnvelope<PromoCode>>(`/admin/promo-codes/${id}`, input);
  return res.data.data;
}

export async function deletePromoCode(id: number): Promise<void> {
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

export async function updateSkill(id: number, input: UpdateSkillInput): Promise<Skill> {
  const res = await apiClient.patch<ApiEnvelope<Skill>>(`/admin/skills/${id}`, input);
  return res.data.data;
}

export async function fetchServiceAreas(): Promise<ServiceArea[]> {
  const res = await apiClient.get<ApiEnvelope<ServiceArea[]>>('/admin/service-areas');
  return res.data.data;
}

export async function createServiceArea(input: CreateServiceAreaInput): Promise<ServiceArea> {
  const res = await apiClient.post<ApiEnvelope<ServiceArea>>('/admin/service-areas', input);
  return res.data.data;
}

export async function updateServiceArea(
  id: number,
  input: UpdateServiceAreaInput,
): Promise<ServiceArea> {
  const res = await apiClient.patch<ApiEnvelope<ServiceArea>>(`/admin/service-areas/${id}`, input);
  return res.data.data;
}

export async function deleteServiceArea(id: number): Promise<void> {
  await apiClient.delete(`/admin/service-areas/${id}`);
}

export async function lookupServiceArea(q: string): Promise<ServiceAreaLookup> {
  const res = await apiClient.get<ApiEnvelope<ServiceAreaLookup>>('/admin/service-areas/lookup', {
    params: { q },
  });
  return res.data.data;
}

export async function fetchServiceAreaSettings(): Promise<ServiceAreaSettings> {
  const res = await apiClient.get<ApiEnvelope<ServiceAreaSettings>>(
    '/admin/service-areas/settings',
  );
  return res.data.data;
}

export async function updateServiceAreaSettings(
  input: ServiceAreaSettings,
): Promise<ServiceAreaSettings> {
  const res = await apiClient.put<ApiEnvelope<ServiceAreaSettings>>(
    '/admin/service-areas/settings',
    input,
  );
  return res.data.data;
}

export async function fetchMotherPins(): Promise<MotherPin[]> {
  const res = await apiClient.get<ApiEnvelope<MotherPin[]>>('/admin/service-areas/mother-pins');
  return res.data.data;
}

export async function deleteSkill(id: number): Promise<void> {
  await apiClient.delete(`/admin/skills/${id}`);
}

export async function setNannySkills(id: number, input: SetNannySkillsInput): Promise<AdminNanny> {
  const res = await apiClient.put<ApiEnvelope<AdminNanny>>(`/admin/nannies/${id}/skills`, input);
  return res.data.data;
}

export async function fetchCertifications(): Promise<Certification[]> {
  const res = await apiClient.get<ApiEnvelope<Certification[]>>('/admin/certifications');
  return res.data.data;
}

export async function createCertification(input: CreateCertificationInput): Promise<Certification> {
  const res = await apiClient.post<ApiEnvelope<Certification>>('/admin/certifications', input);
  return res.data.data;
}

export async function updateCertification(
  id: number,
  input: UpdateCertificationInput,
): Promise<Certification> {
  const res = await apiClient.patch<ApiEnvelope<Certification>>(
    `/admin/certifications/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteCertification(id: number): Promise<void> {
  await apiClient.delete(`/admin/certifications/${id}`);
}

// ── App releases (force update) ────────────────────────────────

export async function fetchAppReleases(): Promise<AppRelease[]> {
  const res = await apiClient.get<ApiEnvelope<AppRelease[]>>('/admin/app-releases');
  return res.data.data;
}

export async function createAppRelease(input: CreateAppReleaseInput): Promise<AppRelease> {
  const res = await apiClient.post<ApiEnvelope<AppRelease>>('/admin/app-releases', input);
  return res.data.data;
}

export async function updateAppRelease(id: number, input: UpdateAppReleaseInput): Promise<AppRelease> {
  const res = await apiClient.patch<ApiEnvelope<AppRelease>>(`/admin/app-releases/${id}`, input);
  return res.data.data;
}

export async function deleteAppRelease(id: number): Promise<void> {
  await apiClient.delete(`/admin/app-releases/${id}`);
}

// ── Packages (purchasable hour bundles, EGP) ───────────────────

export async function fetchPackages(): Promise<Package[]> {
  const res = await apiClient.get<ApiEnvelope<Package[]>>('/admin/packages');
  return res.data.data;
}

export async function createPackage(input: CreatePackageInput): Promise<Package> {
  const res = await apiClient.post<ApiEnvelope<Package>>('/admin/packages', input);
  return res.data.data;
}

export async function updatePackage(id: number, input: UpdatePackageInput): Promise<Package> {
  const res = await apiClient.patch<ApiEnvelope<Package>>(`/admin/packages/${id}`, input);
  return res.data.data;
}

export async function deletePackage(id: number): Promise<void> {
  await apiClient.delete(`/admin/packages/${id}`);
}

// ── Campaigns (Home-screen promo carousel) ─────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await apiClient.get<ApiEnvelope<Campaign[]>>('/admin/campaigns');
  return res.data.data;
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const res = await apiClient.post<ApiEnvelope<Campaign>>('/admin/campaigns', input);
  return res.data.data;
}

export async function updateCampaign(id: number, input: UpdateCampaignInput): Promise<Campaign> {
  const res = await apiClient.patch<ApiEnvelope<Campaign>>(`/admin/campaigns/${id}`, input);
  return res.data.data;
}

export async function deleteCampaign(id: number): Promise<void> {
  await apiClient.delete(`/admin/campaigns/${id}`);
}

// ── Surveys ────────────────────────────────────────────────────

export async function fetchSurveys(params: {
  status?: SurveyStatus;
  page: number;
  limit: number;
  sortBy: AdminSurveySortKey;
  sortDir: AdminSortDir;
}): Promise<Paged<AdminSurveySummary[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminSurveySummary[]>>('/admin/surveys', { params });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchSurvey(id: number): Promise<AdminSurvey> {
  const res = await apiClient.get<ApiEnvelope<AdminSurvey>>(`/admin/surveys/${id}`);
  return res.data.data;
}

export async function createSurvey(input: SurveyDraftInput): Promise<AdminSurvey> {
  const res = await apiClient.post<ApiEnvelope<AdminSurvey>>('/admin/surveys', input);
  return res.data.data;
}

export async function updateSurvey(id: number, input: SurveyDraftInput): Promise<AdminSurvey> {
  const res = await apiClient.patch<ApiEnvelope<AdminSurvey>>(`/admin/surveys/${id}`, input);
  return res.data.data;
}

export async function deleteSurvey(id: number): Promise<void> {
  await apiClient.delete(`/admin/surveys/${id}`);
}

export async function duplicateSurvey(id: number): Promise<AdminSurvey> {
  const res = await apiClient.post<ApiEnvelope<AdminSurvey>>(`/admin/surveys/${id}/duplicate`);
  return res.data.data;
}

export async function publishSurvey(id: number, target: SurveyTargetInput): Promise<SurveySendResult> {
  const res = await apiClient.post<ApiEnvelope<SurveySendResult>>(`/admin/surveys/${id}/publish`, target);
  return res.data.data;
}

export async function addSurveyRecipients(id: number, target: SurveyTargetInput): Promise<SurveySendResult> {
  const res = await apiClient.post<ApiEnvelope<SurveySendResult>>(`/admin/surveys/${id}/recipients`, target);
  return res.data.data;
}

export async function resendSurvey(id: number, body: SurveyResendInput): Promise<SurveySendResult> {
  const res = await apiClient.post<ApiEnvelope<SurveySendResult>>(`/admin/surveys/${id}/resend`, body);
  return res.data.data;
}

export async function closeSurvey(id: number): Promise<AdminSurvey> {
  const res = await apiClient.post<ApiEnvelope<AdminSurvey>>(`/admin/surveys/${id}/close`);
  return res.data.data;
}

export async function fetchSurveyResults(id: number): Promise<SurveyResults> {
  const res = await apiClient.get<ApiEnvelope<SurveyResults>>(`/admin/surveys/${id}/results`);
  return res.data.data;
}

export async function fetchSurveyTextAnswers(
  id: number,
  questionId: number,
  page: number,
  limit: number,
): Promise<Paged<SurveyTextAnswer[]>> {
  const res = await apiClient.get<PagedEnvelope<SurveyTextAnswer[]>>(`/admin/surveys/${id}/text-answers`, {
    params: { questionId, page, limit },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchSurveyRecipients(
  id: number,
  params: {
    status?: SurveyRecipientStatus;
    page: number;
    limit: number;
    sortBy: AdminSurveyRecipientSortKey;
    sortDir: AdminSortDir;
  },
): Promise<Paged<AdminSurveyRecipient[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminSurveyRecipient[]>>(`/admin/surveys/${id}/recipients`, {
    params,
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchSurveyRecipientAnswers(
  id: number,
  userId: number,
): Promise<AdminSurveyRecipientAnswers> {
  const res = await apiClient.get<ApiEnvelope<AdminSurveyRecipientAnswers>>(
    `/admin/surveys/${id}/recipients/${userId}`,
  );
  return res.data.data;
}

// ── User groups & mother picker ────────────────────────────────

export async function fetchUserGroups(): Promise<UserGroup[]> {
  const res = await apiClient.get<ApiEnvelope<UserGroup[]>>('/admin/groups');
  return res.data.data;
}

export async function fetchUserGroup(id: number): Promise<UserGroup> {
  const res = await apiClient.get<ApiEnvelope<UserGroup>>(`/admin/groups/${id}`);
  return res.data.data;
}

export async function createUserGroup(input: UserGroupInput): Promise<UserGroup> {
  const res = await apiClient.post<ApiEnvelope<UserGroup>>('/admin/groups', input);
  return res.data.data;
}

export async function updateUserGroup(id: number, input: UserGroupInput): Promise<UserGroup> {
  const res = await apiClient.patch<ApiEnvelope<UserGroup>>(`/admin/groups/${id}`, input);
  return res.data.data;
}

export async function deleteUserGroup(id: number): Promise<void> {
  await apiClient.delete(`/admin/groups/${id}`);
}

export async function addUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  const res = await apiClient.post<ApiEnvelope<UserGroup>>(`/admin/groups/${id}/members`, { userIds });
  return res.data.data;
}

export async function removeUserGroupMembers(id: number, userIds: number[]): Promise<UserGroup> {
  const res = await apiClient.delete<ApiEnvelope<UserGroup>>(`/admin/groups/${id}/members`, {
    data: { userIds },
  });
  return res.data.data;
}

export async function fetchMotherPicker(params: {
  search?: string;
  groupId?: number;
  excludeGroupId?: number;
  page: number;
  limit: number;
  sortBy: MotherPickerSortKey;
  sortDir: AdminSortDir;
}): Promise<Paged<MotherPickerRow[]>> {
  const res = await apiClient.get<PagedEnvelope<MotherPickerRow[]>>('/admin/mother-picker', {
    params: { ...params, search: params.search || undefined },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchCameras(): Promise<Camera[]> {
  const res = await apiClient.get<ApiEnvelope<Camera[]>>('/admin/cameras');
  return res.data.data;
}

export async function fetchNannyOptions(): Promise<NannyOption[]> {
  const res = await apiClient.get<ApiEnvelope<NannyOption[]>>('/admin/cameras/nanny-options');
  return res.data.data;
}

export async function createCamera(input: CreateCameraInput): Promise<Camera> {
  const res = await apiClient.post<ApiEnvelope<Camera>>('/admin/cameras', input);
  return res.data.data;
}

export async function updateCamera(id: number, input: UpdateCameraInput): Promise<Camera> {
  const res = await apiClient.patch<ApiEnvelope<Camera>>(`/admin/cameras/${id}`, input);
  return res.data.data;
}

export async function deleteCamera(id: number): Promise<void> {
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

export async function fetchSupportContact(): Promise<SupportContact> {
  const res = await apiClient.get<ApiEnvelope<SupportContact>>('/admin/support-contact');
  return res.data.data;
}

export async function updateSupportContact(
  input: UpdateSupportContactInput,
): Promise<SupportContact> {
  const res = await apiClient.put<ApiEnvelope<SupportContact>>('/admin/support-contact', input);
  return res.data.data;
}

export async function fetchSupportFaq(): Promise<SupportFaq> {
  const res = await apiClient.get<ApiEnvelope<SupportFaq>>('/admin/support-faq');
  return res.data.data;
}

/** Replaces the whole list — the editor always saves everything it shows. */
export async function updateSupportFaq(input: SupportFaq): Promise<SupportFaq> {
  const res = await apiClient.put<ApiEnvelope<SupportFaq>>('/admin/support-faq', input);
  return res.data.data;
}

/** Both legal documents; an unsaved one is a placeholder with a null `updatedAt`. */
export async function fetchLegalDocuments(): Promise<LegalDocuments> {
  const res = await apiClient.get<ApiEnvelope<LegalDocuments>>('/admin/legal-documents');
  return res.data.data;
}

/** Saves one document; the other is left as it was. */
export async function updateLegalDocument(
  key: LegalDocumentKey,
  input: UpdateLegalDocumentInput,
): Promise<LegalDocument> {
  const res = await apiClient.put<ApiEnvelope<LegalDocument>>(
    `/admin/legal-documents/${key}`,
    input,
  );
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

export async function createDurationRule(input: CreateDurationRuleInput): Promise<DurationRule> {
  const res = await apiClient.post<ApiEnvelope<DurationRule>>('/admin/duration-rules', input);
  return res.data.data;
}

export async function updateDurationRule(
  id: number,
  input: UpdateDurationRuleInput,
): Promise<DurationRule> {
  const res = await apiClient.patch<ApiEnvelope<DurationRule>>(
    `/admin/duration-rules/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteDurationRule(id: number): Promise<void> {
  await apiClient.delete(`/admin/duration-rules/${id}`);
}

// ── Pricing calculator (authoritative preview) ─────────────────

export async function calculatePricePreview(input: PricePreviewInput): Promise<PriceBreakdown> {
  const res = await apiClient.post<ApiEnvelope<PriceBreakdown>>('/admin/pricing/calculate', input);
  return res.data.data;
}

export async function fetchBookings(
  status: AdminBookingStatusFilter,
  { page, limit, sortBy, sortDir }: ColumnSortedListQuery<AdminBookingSortKey>,
): Promise<Paged<AdminBooking[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminBooking[]>>('/admin/bookings', {
    params: { status, page, limit, sortBy, sortDir },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchBooking(id: string): Promise<AdminBookingDetail> {
  const res = await apiClient.get<ApiEnvelope<AdminBookingDetail>>(`/admin/bookings/${id}`);
  return res.data.data;
}

export async function fetchBookingMessages(id: string): Promise<BookingMessageListResponse> {
  const res = await apiClient.get<ApiEnvelope<BookingMessageListResponse>>(
    `/admin/bookings/${id}/messages`,
  );
  return res.data.data;
}

export async function approveBooking(id: number): Promise<AdminBooking> {
  const res = await apiClient.post<ApiEnvelope<AdminBooking>>(`/admin/bookings/${id}/approve`);
  return res.data.data;
}

export async function rejectBooking(id: number, reason?: string): Promise<AdminBooking> {
  const res = await apiClient.post<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/reject`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function setBookingStatus(
  id: number,
  status: SetBookingStatusInput['status'],
): Promise<AdminBooking> {
  const res = await apiClient.patch<ApiEnvelope<AdminBooking>>(`/admin/bookings/${id}/status`, {
    status,
  });
  return res.data.data;
}

export async function fetchBookingCandidates(
  id: number,
  q?: string,
  limit = 50,
): Promise<AdminBookingCandidate[]> {
  const res = await apiClient.get<ApiEnvelope<AdminBookingCandidate[]>>(
    `/admin/bookings/${id}/candidates`,
    { params: { limit, ...(q ? { q } : {}) } },
  );
  return res.data.data;
}

export async function assignBookingNanny(
  id: number,
  nannyProfileId: number,
): Promise<AdminBooking> {
  const res = await apiClient.patch<ApiEnvelope<AdminBooking>>(`/admin/bookings/${id}/nanny`, {
    nannyProfileId,
  });
  return res.data.data;
}

export async function updateBookingTimes(
  id: number,
  input: UpdateBookingTimesInput,
): Promise<AdminBooking> {
  const res = await apiClient.patch<ApiEnvelope<AdminBooking>>(
    `/admin/bookings/${id}/times`,
    input,
  );
  return res.data.data;
}

export async function fetchBookingEditContext(id: number): Promise<AdminBookingEditContext> {
  const res = await apiClient.get<ApiEnvelope<AdminBookingEditContext>>(
    `/admin/bookings/${id}/edit/context`,
  );
  return res.data.data;
}

export async function previewBookingEdit(
  id: number,
  input: AdminEditBookingInput,
): Promise<AdminEditPreviewResponse> {
  const res = await apiClient.post<ApiEnvelope<AdminEditPreviewResponse>>(
    `/admin/bookings/${id}/edit/preview`,
    input,
  );
  return res.data.data;
}

export async function applyBookingEdit(
  id: number,
  input: AdminEditBookingCommitInput,
): Promise<AdminEditCommitResponse> {
  const res = await apiClient.post<ApiEnvelope<AdminEditCommitResponse>>(
    `/admin/bookings/${id}/edit`,
    input,
  );
  return res.data.data;
}

export async function refundBooking(
  id: number,
  input: AdminRefundBookingInput,
): Promise<AdminRefundResponse> {
  const res = await apiClient.post<ApiEnvelope<AdminRefundResponse>>(
    `/admin/bookings/${id}/refund`,
    input,
  );
  return res.data.data;
}

export async function fetchNannies(
  status: AdminApprovalStatusFilter,
  { page, limit, sortBy, sortDir }: ColumnSortedListQuery<AdminNannySortKey>,
): Promise<Paged<AdminNanny[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminNanny[]>>('/admin/nannies', {
    params: { status, page, limit, sortBy, sortDir },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchNanny(id: string): Promise<AdminNannyDetail> {
  const res = await apiClient.get<ApiEnvelope<AdminNannyDetail>>(`/admin/nannies/${id}`);
  return res.data.data;
}

export async function approveNanny(id: string): Promise<AdminNanny> {
  const res = await apiClient.post<ApiEnvelope<AdminNanny>>(`/admin/nannies/${id}/approve`);
  return res.data.data;
}

export async function rejectNanny(id: string, reason?: string): Promise<AdminNanny> {
  const res = await apiClient.post<ApiEnvelope<AdminNanny>>(
    `/admin/nannies/${id}/reject`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function updateNanny(id: number, input: UpdateAdminNanny): Promise<AdminNannyDetail> {
  const res = await apiClient.patch<ApiEnvelope<AdminNannyDetail>>(`/admin/nannies/${id}`, input);
  return res.data.data;
}

/** Rewrites a nanny's single address — the one way it changes after registration. */
export async function updateNannyAddress(
  nannyProfileId: number,
  input: AdminUpsertNannyAddressInput,
): Promise<Address> {
  const res = await apiClient.put<ApiEnvelope<Address>>(
    `/admin/nannies/${nannyProfileId}/address`,
    input,
  );
  return res.data.data;
}

/** Gives a nanny a free camera, or takes hers away with null. */
export async function assignNannyCamera(
  nannyProfileId: number,
  cameraId: number | null,
): Promise<AdminNannyCamera | null> {
  const res = await apiClient.put<ApiEnvelope<AdminNannyCamera | null>>(
    `/admin/nannies/${nannyProfileId}/camera`,
    { cameraId },
  );
  return res.data.data;
}

/** A mother's address book, default first. Read-only in the console. */
export async function fetchMotherAddresses(motherId: number): Promise<Address[]> {
  const res = await apiClient.get<ApiEnvelope<Address[]>>(`/admin/mothers/${motherId}/addresses`);
  return res.data.data;
}

export async function fetchMothers(
  status: AdminApprovalStatusFilter,
  { page, limit, sortBy, sortDir }: ColumnSortedListQuery<AdminUserSortKey>,
): Promise<Paged<AdminMother[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminMother[]>>('/admin/mothers', {
    params: { status, page, limit, sortBy, sortDir },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchMother(id: string): Promise<AdminMotherDetail> {
  const res = await apiClient.get<ApiEnvelope<AdminMotherDetail>>(`/admin/mothers/${id}`);
  return res.data.data;
}

export async function updateMother(
  id: string,
  input: UpdateAdminMotherInput,
): Promise<AdminMotherDetail> {
  const res = await apiClient.patch<ApiEnvelope<AdminMotherDetail>>(`/admin/mothers/${id}`, input);
  return res.data.data;
}

export async function approveMother(id: string): Promise<AdminMother> {
  const res = await apiClient.post<ApiEnvelope<AdminMother>>(`/admin/mothers/${id}/approve`);
  return res.data.data;
}

export async function rejectMother(id: string, reason?: string): Promise<AdminMother> {
  const res = await apiClient.post<ApiEnvelope<AdminMother>>(
    `/admin/mothers/${id}/reject`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function invalidateNannyId(id: string, reason?: string): Promise<AdminNanny> {
  const res = await apiClient.post<ApiEnvelope<AdminNanny>>(
    `/admin/nannies/${id}/invalidate-id`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

export async function invalidateMotherId(id: string, reason?: string): Promise<AdminMother> {
  const res = await apiClient.post<ApiEnvelope<AdminMother>>(
    `/admin/mothers/${id}/invalidate-id`,
    reason ? { reason } : {},
  );
  return res.data.data;
}

// ── Parent ID review queue ─────────────────────────────────────

export async function fetchIdReviews(
  status: AdminApprovalStatusFilter,
  { page, limit, sort }: SortableListQuery,
): Promise<Paged<AdminIdReview[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminIdReview[]>>('/admin/id-reviews', {
    params: { status, page, limit, sort },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchAdmins(): Promise<AdminUser[]> {
  const res = await apiClient.get<ApiEnvelope<AdminUser[]>>('/admin/admins');
  return res.data.data;
}

export async function createAdmin(input: CreateAdminInput): Promise<AdminUser> {
  const res = await apiClient.post<ApiEnvelope<AdminUser>>('/admin/admins', input);
  return res.data.data;
}

export async function updateAdmin(id: number, input: UpdateAdminUserInput): Promise<AdminUser> {
  const res = await apiClient.patch<ApiEnvelope<AdminUser>>(`/admin/admins/${id}`, input);
  return res.data.data;
}

export async function deleteAdmin(id: number): Promise<void> {
  await apiClient.delete(`/admin/admins/${id}`);
}

// ── Package purchases (admin visibility into the consumption ledger) ──

export async function fetchPackagePurchases(
  params: AdminPackagePurchaseListQuery,
): Promise<Paged<AdminPackagePurchase[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminPackagePurchase[]>>(
    '/admin/package-purchases',
    { params },
  );
  return { data: res.data.data, meta: res.data.meta };
}

export async function fetchPackagePurchaseDetail(id: number): Promise<AdminPackagePurchaseDetail> {
  const res = await apiClient.get<ApiEnvelope<AdminPackagePurchaseDetail>>(
    `/admin/package-purchases/${id}`,
  );
  return res.data.data;
}

// ── Community moderation (every post type) ─────────────────────

export async function fetchCommunityPosts(
  type: AdminCommunityTypeFilter,
  status: AdminCommunityStatusFilter,
  { page, limit, sortBy, sortDir }: ColumnSortedListQuery<AdminCommunitySortKey>,
): Promise<Paged<AdminCommunityPost[]>> {
  const res = await apiClient.get<PagedEnvelope<AdminCommunityPost[]>>('/admin/community/posts', {
    params: { type, status, page, limit, sortBy, sortDir },
  });
  return { data: res.data.data, meta: res.data.meta };
}

export async function approvePost(id: number): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    `/admin/community/posts/${id}/approve`,
  );
  return res.data.data;
}

export async function rejectPost(id: number, reason: string): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    `/admin/community/posts/${id}/reject`,
    { reason },
  );
  return res.data.data;
}

// ── Official posts (events, Q&A, listings) ─────────────────────

export async function createOfficialPost(
  input: CreateOfficialPostInput,
): Promise<AdminCommunityPost> {
  const res = await apiClient.post<ApiEnvelope<AdminCommunityPost>>(
    '/admin/community/official-posts',
    input,
  );
  return res.data.data;
}

export async function updateOfficialPost(
  id: number,
  input: UpdateOfficialPostInput,
): Promise<AdminCommunityPost> {
  const res = await apiClient.patch<ApiEnvelope<AdminCommunityPost>>(
    `/admin/community/official-posts/${id}`,
    input,
  );
  return res.data.data;
}

export async function deleteOfficialPost(id: number): Promise<void> {
  await apiClient.delete(`/admin/community/official-posts/${id}`);
}

// ── Manual release-test checklist (public /qa page) ────────────

/**
 * These three are the only endpoints in this file that are reached without an
 * admin account — the release-test checklist is walked by the business team,
 * who have no console login. `apiClient` sends no Authorization header when
 * nobody is signed in, which is exactly what they want. The backend mounts
 * them only when QA_CHECKLIST_ENABLED is set.
 */
export async function fetchQaChecklist(): Promise<QaChecklistState> {
  const res = await apiClient.get<ApiEnvelope<QaChecklistState>>('/qa-checklist');
  return res.data.data;
}

export async function setQaScenarioStatus(
  scenarioId: string,
  input: SetQaScenarioStatusInput,
): Promise<QaChecklistEntry> {
  const res = await apiClient.put<ApiEnvelope<QaChecklistEntry>>(
    `/qa-checklist/${scenarioId}`,
    input,
  );
  return res.data.data;
}

export async function resetQaChecklist(): Promise<number> {
  const res = await apiClient.post<ApiEnvelope<{ cleared: number }>>('/qa-checklist/reset');
  return res.data.data.cleared;
}

export async function fetchCancellationCellProposals(): Promise<CancellationCellProposalsState> {
  const res = await apiClient.get<ApiEnvelope<CancellationCellProposalsState>>(
    '/cancellation-policy/cells',
  );
  return res.data.data;
}

export async function setCancellationCellProposal(
  flowId: CancellationFlowId,
  outcome: CancellationOutcomeKey,
  input: SetCancellationCellProposalInput,
): Promise<CancellationCellProposal> {
  const res = await apiClient.put<ApiEnvelope<CancellationCellProposal>>(
    `/cancellation-policy/cells/${flowId}/${outcome}`,
    input,
  );
  return res.data.data;
}

export async function clearCancellationCellProposal(
  flowId: CancellationFlowId,
  outcome: CancellationOutcomeKey,
): Promise<void> {
  await apiClient.delete(`/cancellation-policy/cells/${flowId}/${outcome}`);
}
