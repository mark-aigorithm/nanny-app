import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Referrals — a parent shares a personal code; the invitee redeems
// it just after signing up and is credited Care Points immediately,
// and the referrer is credited once that invitee's first booking
// completes. Payout amounts live on RewardConfig (see ./rewards).
// This module has no internal imports, so it stays free of cycles.
// ──────────────────────────────────────────────────────────────

/** Lifecycle of a referral. Mirrors the DB `referral_status` enum. */
export const ReferralStatusSchema = z.enum(['PENDING', 'CONVERTED']);
export type ReferralStatus = z.infer<typeof ReferralStatusSchema>;

/**
 * Shape of a generated referral code: an uppercase name stem, a hyphen, then
 * four base32 characters (e.g. SARAH-4K2P). Shared so the client can validate
 * and normalise input before spending a round trip.
 */
export const REFERRAL_CODE_PATTERN = /^[A-Z]{1,8}-[A-Z0-9]{4}$/;

/** Max length accepted for a submitted code, generous enough for the format above. */
export const REFERRAL_CODE_MAX_LENGTH = 32;

// ── Responses ──────────────────────────────────────────────────

/**
 * One of the referrer's invitees, as shown in their referral list. Carries the
 * invitee's first name only — a referrer never learns their email or full name.
 */
export const ReferralListItemSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  status: ReferralStatusSchema,
  /** Points the referrer earned from this invitee; 0 while still PENDING. */
  points: z.number().int(),
  createdAt: z.string(),
  convertedAt: z.string().nullable(),
});
export type ReferralListItem = z.infer<typeof ReferralListItemSchema>;

/** Headline counts for the referral screen. */
export const ReferralStatsSchema = z.object({
  /** Invitees who have redeemed this user's code, in any state. */
  invited: z.number().int(),
  /** Invitees whose first booking completed, so the referrer was paid. */
  joined: z.number().int(),
  /** Total points earned from referrals to date. */
  pointsEarned: z.number().int(),
});
export type ReferralStats = z.infer<typeof ReferralStatsSchema>;

/** Everything the Refer a friend screen needs in one call. */
export const ReferralSummarySchema = z.object({
  code: z.string(),
  /** Pre-composed invite text for the native share sheet. */
  shareMessage: z.string(),
  /** Whether the program is currently switched on by admins. */
  enabled: z.boolean(),
  /** Payout the referrer earns per successful invite (for the hero copy). */
  referrerPoints: z.number().int(),
  /** Welcome grant the invitee receives (for the hero copy). */
  refereePoints: z.number().int(),
  stats: ReferralStatsSchema,
  referrals: z.array(ReferralListItemSchema),
});
export type ReferralSummary = z.infer<typeof ReferralSummarySchema>;

/**
 * Result of checking a code before submitting it, so the signup field can give
 * immediate feedback. Never reveals whether an unmatched code merely doesn't
 * exist or is self-referral — both come back simply invalid.
 */
export const ValidateReferralCodeResponseSchema = z.object({
  valid: z.boolean(),
  /** The referrer's first name, for "Invited by Sarah" style confirmation. */
  referrerFirstName: z.string().nullable(),
  /** Points the invitee will receive, so the field can promise a real number. */
  refereePoints: z.number().int(),
});
export type ValidateReferralCodeResponse = z.infer<typeof ValidateReferralCodeResponseSchema>;

/** Result of redeeming a code. */
export const RedeemReferralResponseSchema = z.object({
  referrerFirstName: z.string(),
  /** Points credited to the invitee's wallet by this redemption. */
  pointsAwarded: z.number().int(),
});
export type RedeemReferralResponse = z.infer<typeof RedeemReferralResponseSchema>;

// ── Requests ───────────────────────────────────────────────────

/**
 * A submitted referral code. Trimmed and uppercased on the way in so codes are
 * accepted however the invitee typed or pasted them.
 */
export const RedeemReferralSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Enter a referral code')
    .max(REFERRAL_CODE_MAX_LENGTH, 'That referral code is too long')
    .transform((c) => c.toUpperCase()),
});
export type RedeemReferralInput = z.infer<typeof RedeemReferralSchema>;

/** Query for the pre-submit validation endpoint. */
export const ValidateReferralCodeQuerySchema = RedeemReferralSchema;
export type ValidateReferralCodeQuery = z.infer<typeof ValidateReferralCodeQuerySchema>;
