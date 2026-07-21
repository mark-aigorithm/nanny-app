import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Cameras (admin-managed)
// ──────────────────────────────────────────────────────────────

/** Camera as returned by the API. `nannyName` is the resolved display name of
 *  the assigned nanny user, or null when the camera is unassigned. */
export const CameraSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  streamUrl: z.string(),
  nannyUserId: z.number().int().nullable(),
  nannyName: z.string().nullable(),
  createdAt: z.string(),
});
export type Camera = z.infer<typeof CameraSchema>;

export const CreateCameraSchema = z.object({
  name: z.string().trim().min(1).max(100),
  streamUrl: z.string().url(),
  /** Nanny user id to assign. Omit or null to leave unassigned. */
  nannyUserId: z.number().int().nullable().optional(),
});
export type CreateCameraInput = z.infer<typeof CreateCameraSchema>;

export const UpdateCameraSchema = CreateCameraSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'Provide at least one field to update' },
);
export type UpdateCameraInput = z.infer<typeof UpdateCameraSchema>;

// ──────────────────────────────────────────────────────────────
// Live monitoring (parent-facing)
// ──────────────────────────────────────────────────────────────

/** The camera feed for an in-progress booking, as served to the parent.
 *
 *  `streamUrl` is an `rtsp://` URL and is deliberately NOT part of
 *  BookingResponse — RTSP URLs routinely embed credentials, so it is only ever
 *  returned from the dedicated, status-gated endpoint. BookingResponse carries
 *  a `hasCamera` boolean instead, which is all the UI needs to show the button.
 *
 *  `online` comes from a TCP reachability probe: true/false when the host could
 *  be dialled, null when the URL could not be parsed. It proves the camera is
 *  reachable, NOT that a stream is actually flowing. */
export const BookingCameraSchema = z.object({
  name: z.string(),
  streamUrl: z.string(),
  online: z.boolean().nullable(),
  checkedAt: z.string(),
});
export type BookingCamera = z.infer<typeof BookingCameraSchema>;

/** Result of asking the nanny to turn the camera on. */
export const NotifyCameraResponseSchema = z.object({
  notifiedAt: z.string(),
});
export type NotifyCameraResponse = z.infer<typeof NotifyCameraResponseSchema>;

/** Cooldown between two "turn the camera on" nudges to the same booking. */
export const CAMERA_NOTIFY_COOLDOWN_SECONDS = 300;

/** Option for the admin nanny-assignment dropdown. */
export const NannyOptionSchema = z.object({
  userId: z.number().int(),
  name: z.string(),
});
export type NannyOption = z.infer<typeof NannyOptionSchema>;
