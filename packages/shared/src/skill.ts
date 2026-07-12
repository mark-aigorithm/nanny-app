import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Skills — admin-curated nanny specialties (controlled replacement
// for the free-text NannyProfile.specialties array). Linked to
// nannies many-to-many. This module imports nothing internal so it
// can be consumed by both admin and public nanny schemas without
// creating an import cycle.
// ──────────────────────────────────────────────────────────────

/** Lightweight skill shape embedded in nanny profile/listing responses. */
export const PublicSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type PublicSkill = z.infer<typeof PublicSkillSchema>;

/** Full admin DTO returned by the admin Skills endpoints. */
export const SkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type Skill = z.infer<typeof SkillSchema>;

export const CreateSkillSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});
export type CreateSkillInput = z.infer<typeof CreateSkillSchema>;

export const UpdateSkillSchema = CreateSkillSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' },
);
export type UpdateSkillInput = z.infer<typeof UpdateSkillSchema>;

/** Admin assignment payload — the full desired set of skill ids for a nanny. */
export const SetNannySkillsSchema = z.object({
  skillIds: z.array(z.string()),
});
export type SetNannySkillsInput = z.infer<typeof SetNannySkillsSchema>;
