import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Cameras (admin-managed)
// ──────────────────────────────────────────────────────────────

/** Camera as returned by the API. `nannyName` is the resolved display name of
 *  the assigned nanny user, or null when the camera is unassigned. */
export const CameraSchema = z.object({
  id: z.string(),
  name: z.string(),
  streamUrl: z.string(),
  nannyUserId: z.string().nullable(),
  nannyName: z.string().nullable(),
  createdAt: z.string(),
});
export type Camera = z.infer<typeof CameraSchema>;

export const CreateCameraSchema = z.object({
  name: z.string().trim().min(1).max(100),
  streamUrl: z.string().url(),
  /** Nanny user id to assign. Omit or null to leave unassigned. */
  nannyUserId: z.string().nullable().optional(),
});
export type CreateCameraInput = z.infer<typeof CreateCameraSchema>;

export const UpdateCameraSchema = CreateCameraSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' },
);
export type UpdateCameraInput = z.infer<typeof UpdateCameraSchema>;

/** Option for the admin nanny-assignment dropdown. */
export const NannyOptionSchema = z.object({
  userId: z.string(),
  name: z.string(),
});
export type NannyOption = z.infer<typeof NannyOptionSchema>;
