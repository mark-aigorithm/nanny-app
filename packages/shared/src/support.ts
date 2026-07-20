import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Support contact — the WhatsApp number, phone number, and email
// address parents use to reach support. Stored in app_settings and
// edited by admins, so operations can change a line without a
// mobile release. An empty string means "not configured": the app
// hides that channel rather than showing a dead button.
// ──────────────────────────────────────────────────────────────

/** Mandatory leading '+', then 7–15 digits, once separators are stripped. */
const PHONE_PATTERN = /^\+\d{7,15}$/;

/**
 * Canonical form of a phone number: whitespace, dashes, parentheses, and dots
 * removed, and a leading '00' (international access prefix) rewritten to
 * '+'. Admins can paste a number in any readable format — e.g.
 * "+20 (100) 123.4567" — this function only computes the canonical form for
 * validation and display — it does not persist anything. The caller (the
 * support-contact service) is responsible for applying it before writing to
 * the DB.
 */
export function normalizePhone(value: string): string {
  const stripped = value.replace(/[\s\-().]/g, '');
  return stripped.startsWith('00') ? `+${stripped.slice(2)}` : stripped;
}

/**
 * WhatsApp click-to-chat URL. wa.me wants bare digits — no '+', no
 * separators. The https form (rather than the whatsapp:// scheme) degrades
 * to the browser or app store when WhatsApp is not installed, instead of
 * failing silently.
 */
export function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}`;
}

/** Accepts a valid phone number or an empty string (channel disabled). */
const supportPhone = z
  .string()
  .refine((v) => v === '' || PHONE_PATTERN.test(normalizePhone(v)), {
    message:
      'Enter a valid phone number including the country code, e.g. +20 100 123 4567 ' +
      '(spaces, dashes, parentheses, and dots are fine), or leave blank to hide this channel.',
  });

export const SupportContactSchema = z.object({
  /** WhatsApp line, in any readable format. '' hides the WhatsApp card. */
  whatsappNumber: supportPhone,
  /** Voice line for the "Call support" card. '' hides it. */
  phoneNumber: supportPhone,
  /** Support inbox for the "Email support" card. '' hides it. */
  email: z.union([z.literal(''), z.string().email()]),
});
export type SupportContact = z.infer<typeof SupportContactSchema>;

/** Partial update payload — an admin may edit one channel at a time. */
export const UpdateSupportContactSchema = SupportContactSchema.partial();
export type UpdateSupportContactInput = z.infer<typeof UpdateSupportContactSchema>;
