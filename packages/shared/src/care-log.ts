import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Care Log — shared Zod schemas
// ──────────────────────────────────────────────────────────────

export const CareLogTypeSchema = z.enum([
  'MEAL',
  'NAP',
  'DIAPER',
  'ACTIVITY',
  'CUSTOM',
]);
export const CareLogType = CareLogTypeSchema.enum;
export type CareLogType = z.infer<typeof CareLogTypeSchema>;

export const CareLogResponseSchema = z.object({
  id: z.number().int(),
  bookingId: z.number().int(),
  nannyProfileId: z.number().int(),
  type: CareLogTypeSchema,
  customLabel: z.string().nullable(),
  /**
   * Which children the entry is about, as their labels on the booking
   * (bookingChildLabel). Empty on entries from builds that didn't ask, and on
   * bookings with no children listed.
   */
  childNames: z.array(z.string()),
  notes: z.string().nullable(),
  occurredAt: z.string(),
  evidenceUrls: z.array(z.string()),
  createdAt: z.string(),
});
export type CareLogResponse = z.infer<typeof CareLogResponseSchema>;

export const CreateCareLogSchema = z
  .object({
    type: CareLogTypeSchema,
    customLabel: z.string().trim().min(1).max(60).optional(),
    /**
     * Labels of the booking's children this entry is about. The app requires
     * at least one when the booking lists children; optional here because
     * builds before this field don't send it.
     */
    childNames: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    notes: z.string().trim().max(1000).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    evidenceUrls: z.array(z.string().url()).max(8).default([]),
  })
  .refine((v) => v.type !== 'CUSTOM' || (v.customLabel && v.customLabel.length > 0), {
    message: 'customLabel is required when type is CUSTOM',
    path: ['customLabel'],
  });
export type CreateCareLogRequest = z.infer<typeof CreateCareLogSchema>;
