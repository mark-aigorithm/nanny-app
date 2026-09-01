import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Email — transactional email the backend sends to users. Templates
// live in the backend (apps/backend/src/lib/email/templates); this
// module is the single source of truth for which templates exist and
// what variables each one substitutes, so the template author and the
// caller can't drift apart. No internal imports — stays cycle-free.
// ──────────────────────────────────────────────────────────────

/**
 * Named email templates. Each value maps to an HTML file the backend renders.
 * Mirrors the DB `email_template` enum (see the EmailLog Prisma model).
 * `RECEIPT` — the payment receipt sent to the paying parent after a booking
 * payment is captured.
 * `EMAIL_VERIFICATION` — the one-time code proving the recipient owns the
 * address they typed (nanny registration, and the mother's pre-booking gate).
 */
export const EmailTemplateSchema = z.enum(['RECEIPT', 'EMAIL_VERIFICATION']);
export type EmailTemplate = z.infer<typeof EmailTemplateSchema>;

/** Delivery outcome recorded for every attempted send. Mirrors `email_status`. */
export const EmailStatusSchema = z.enum(['SENT', 'FAILED']);
export type EmailStatus = z.infer<typeof EmailStatusSchema>;

/**
 * Variables substituted into the `RECEIPT` template. Money fields are plain
 * numbers in major currency units (EGP pounds, matching the DB Decimals) and
 * are formatted for display by the template's `formatMoney` helper. Dates and
 * times arrive pre-formatted as display strings so the template stays free of
 * timezone logic.
 *
 * Reward- and package-credit are deliberately absent: their monetary value is
 * already folded into `discountAmount` (see the Booking schema), so a single
 * discount line avoids double-counting.
 */
export const ReceiptEmailVarsSchema = z.object({
  /** Human-friendly booking reference shown as "Booking #123". */
  bookingId: z.number().int(),
  /** Paying parent's first name, for the greeting. */
  parentName: z.string(),
  /** Assigned nanny's display name. */
  nannyName: z.string(),
  /** Care date, pre-formatted (e.g. "6 August 2026"). */
  bookingDate: z.string(),
  /** Shift start, pre-formatted (e.g. "09:00"). */
  startTime: z.string(),
  /** Shift end, pre-formatted (e.g. "12:00"). */
  endTime: z.string(),
  /** Billed hours. */
  durationHours: z.number(),
  /** ISO 4217-ish currency code snapshot from the payment (e.g. "EGP"). */
  currency: z.string(),
  /** Care cost before discounts. */
  subtotal: z.number(),
  /** Total discounts applied (promo + reward + package credit, combined). */
  discountAmount: z.number(),
  /** Amount actually charged. */
  totalAmount: z.number(),
  /** Payment reference (Paymob transaction or order id) for the parent's records. */
  paymentReference: z.string(),
  /** When the payment was captured, pre-formatted (e.g. "6 August 2026"). */
  paymentDate: z.string(),
});
export type ReceiptEmailVars = z.infer<typeof ReceiptEmailVarsSchema>;

/**
 * Variables substituted into the `EMAIL_VERIFICATION` template. The code is a
 * string rather than a number so its leading zeros survive — "004821" is a
 * valid code and must render as six digits.
 */
export const EmailVerificationEmailVarsSchema = z.object({
  /** The 6-digit one-time code, zero-padded. */
  code: z.string(),
  /** Recipient's first name for the greeting; absent during nanny sign-up, where no user row exists yet. */
  firstName: z.string().optional(),
  /** How long the code stays valid, in whole minutes, for the "expires in …" line. */
  expiryMinutes: z.number().int().positive(),
});
export type EmailVerificationEmailVars = z.infer<typeof EmailVerificationEmailVarsSchema>;
