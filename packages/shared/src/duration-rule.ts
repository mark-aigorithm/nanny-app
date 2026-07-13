import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Duration multiplier rules — admin-configured pricing tiers that
// discount (or surcharge) the subtotal based on how many hours are
// booked. The highest tier whose `minHours` is ≤ the booking's
// duration wins; with no match the multiplier is 1.0 (no change).
// This module imports nothing internal so it can be consumed freely.
// ──────────────────────────────────────────────────────────────

/** Admin DTO returned by the duration-rule endpoints. */
export const DurationRuleSchema = z.object({
  id: z.string(),
  /** Inclusive lower bound in hours for this tier to apply. */
  minHours: z.number().int(),
  /** Factor applied to the subtotal (0.90 = 10% discount, 1.10 = 10% surcharge). */
  multiplier: z.number(),
  label: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type DurationRule = z.infer<typeof DurationRuleSchema>;

export const CreateDurationRuleSchema = z.object({
  minHours: z.number().int().min(1).max(24),
  /** 0.1–2.0: below 1 discounts, above 1 surcharges. */
  multiplier: z.number().positive().min(0.1).max(2),
  label: z.string().trim().max(80).optional(),
  isActive: z.boolean().default(true),
});
export type CreateDurationRuleInput = z.infer<typeof CreateDurationRuleSchema>;

export const UpdateDurationRuleSchema = z
  .object({
    minHours: z.number().int().min(1).max(24).optional(),
    multiplier: z.number().positive().min(0.1).max(2).optional(),
    label: z.string().trim().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateDurationRuleInput = z.infer<typeof UpdateDurationRuleSchema>;

/** Lightweight tier shape embedded in the public pricing config. */
export const PublicDurationRuleSchema = z.object({
  minHours: z.number().int(),
  multiplier: z.number(),
  label: z.string().nullable(),
});
export type PublicDurationRule = z.infer<typeof PublicDurationRuleSchema>;
