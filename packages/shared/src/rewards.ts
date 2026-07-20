import { z } from 'zod';

import { PaginationMetaSchema } from './booking';

// ──────────────────────────────────────────────────────────────
// Care Points (rewards) — parents earn points per completed booked
// hour and redeem them for free care hours (an auto-applied booking
// credit). Admins configure the rates, grant/revoke points manually,
// and browse any user's wallet + full ledger history. This module
// imports only PaginationMetaSchema so it stays free of cycles.
// ──────────────────────────────────────────────────────────────

/** A single movement of points. Mirrors the DB `reward_entry_type` enum. */
export const RewardEntryTypeSchema = z.enum([
  'EARN',
  'REDEEM',
  'REFUND',
  'ADMIN_GRANT',
  'ADMIN_REVOKE',
  /** Both sides of a referral payout; `reason` distinguishes them. */
  'REFERRAL',
]);
export type RewardEntryType = z.infer<typeof RewardEntryTypeSchema>;

// ── Config ─────────────────────────────────────────────────────

/** Admin-tunable earn/redeem rates (singleton). */
export const RewardConfigSchema = z.object({
  /** Master switch — when false, no points are earned or redeemable. */
  enabled: z.boolean(),
  /** Points granted per completed booked hour. */
  pointsPerBookedHour: z.number().int(),
  /** Points required to redeem one free care hour. */
  redemptionPointsPerHour: z.number().int(),
  /** Minimum points a user must spend in a single redemption. */
  minRedemptionPoints: z.number().int(),
  /** Master switch for the referral program (independent of `enabled`). */
  referralEnabled: z.boolean(),
  /** Points granted to the referrer once their invitee's first booking completes. */
  referrerPoints: z.number().int(),
  /** Points granted to the invitee immediately on redeeming a referral code. */
  refereePoints: z.number().int(),
});
export type RewardConfig = z.infer<typeof RewardConfigSchema>;

/** Full-replace update payload for the config form (mirrors platform config). */
export const UpdateRewardConfigSchema = z.object({
  enabled: z.boolean(),
  pointsPerBookedHour: z.number().int().min(0).max(100_000),
  redemptionPointsPerHour: z.number().int().min(1).max(1_000_000),
  minRedemptionPoints: z.number().int().min(0).max(1_000_000),
  referralEnabled: z.boolean(),
  referrerPoints: z.number().int().min(0).max(1_000_000),
  refereePoints: z.number().int().min(0).max(1_000_000),
});
export type UpdateRewardConfigInput = z.infer<typeof UpdateRewardConfigSchema>;

// ── Wallet ─────────────────────────────────────────────────────

/** A user's own wallet (mobile). */
export const RewardWalletSchema = z.object({
  userId: z.number().int(),
  pointsBalance: z.number().int(),
  lifetimeEarned: z.number().int(),
  lifetimeRedeemed: z.number().int(),
});
export type RewardWallet = z.infer<typeof RewardWalletSchema>;

/** Wallet row enriched with the owning user's identity (admin list/detail). */
export const RewardWalletSummarySchema = RewardWalletSchema.extend({
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
});
export type RewardWalletSummary = z.infer<typeof RewardWalletSummarySchema>;

// ── Ledger ─────────────────────────────────────────────────────

/** One row of grant/redemption history. */
export const RewardLedgerEntrySchema = z.object({
  id: z.number().int(),
  type: RewardEntryTypeSchema,
  /** Signed delta: positive = credited, negative = debited. */
  points: z.number().int(),
  /** Running balance immediately after this entry. */
  balanceAfter: z.number().int(),
  reason: z.string().nullable(),
  bookingId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type RewardLedgerEntry = z.infer<typeof RewardLedgerEntrySchema>;

export const RewardHistoryResponseSchema = z.object({
  entries: z.array(RewardLedgerEntrySchema),
  meta: PaginationMetaSchema,
});
export type RewardHistoryResponse = z.infer<typeof RewardHistoryResponseSchema>;

// ── Requests ───────────────────────────────────────────────────

/** Admin manual adjustment. Positive points grant, negative revoke. */
export const GrantPointsSchema = z.object({
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: 'Points must be a non-zero amount' })
    .refine((n) => Math.abs(n) <= 1_000_000, { message: 'Points amount is too large' }),
  reason: z.string().trim().min(1).max(200),
});
export type GrantPointsInput = z.infer<typeof GrantPointsSchema>;

/** Pagination query for a wallet's ledger history. */
export const RewardHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});
export type RewardHistoryQuery = z.infer<typeof RewardHistoryQuerySchema>;

/** Paginated + searchable query for the admin User Wallets list. */
export const RewardWalletListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  /** Case-insensitive match against the parent's name or email. */
  search: z.string().trim().max(200).optional(),
});
export type RewardWalletListQuery = z.infer<typeof RewardWalletListQuerySchema>;
