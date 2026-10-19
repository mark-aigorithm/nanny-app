import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// App releases — the admin's record of each published mobile build,
// per platform. The newest mandatory release is the floor below which
// the app blocks with "update required"; the newest release overall
// drives the dismissible "update available" prompt. Versions are strict
// x.y.z and always compared numerically (1.10.0 > 1.9.0).
// ──────────────────────────────────────────────────────────────

const SEMVER = /^\d+\.\d+\.\d+$/;

export function isSemver(value: string): boolean {
  return SEMVER.test(value);
}

/** -1 / 0 / 1 like a sort comparator; null when either side is not x.y.z. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  if (!isSemver(a) || !isSemver(b)) return null;
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

export const AppPlatformSchema = z.enum(['ios', 'android']);
export type AppPlatform = z.infer<typeof AppPlatformSchema>;

const SemverSchema = z.string().trim().regex(SEMVER, 'Version must look like 1.4.0');
const ReleaseNotesSchema = z.string().trim().max(1000);

/** Admin DTO returned by the /admin/app-releases endpoints. */
export const AppReleaseSchema = z.object({
  id: z.number().int(),
  platform: AppPlatformSchema,
  version: z.string(),
  mandatory: z.boolean(),
  releaseNotes: z.string().nullable(),
  createdAt: z.string(),
});
export type AppRelease = z.infer<typeof AppReleaseSchema>;

export const CreateAppReleaseSchema = z.object({
  platform: AppPlatformSchema,
  version: SemverSchema,
  mandatory: z.boolean().default(false),
  releaseNotes: ReleaseNotesSchema.optional(),
});
export type CreateAppReleaseInput = z.infer<typeof CreateAppReleaseSchema>;

/** Platform and version are fixed once recorded — delete and re-add to correct them. */
export const UpdateAppReleaseSchema = z
  .object({
    mandatory: z.boolean().optional(),
    releaseNotes: ReleaseNotesSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });
export type UpdateAppReleaseInput = z.infer<typeof UpdateAppReleaseSchema>;

/** `version` is deliberately loose: a malformed one resolves to "ok", never a 400. */
export const AppVersionCheckQuerySchema = z.object({
  platform: AppPlatformSchema,
  version: z.string().max(50),
});
export type AppVersionCheckQuery = z.infer<typeof AppVersionCheckQuerySchema>;

export const AppVersionStatusSchema = z.enum(['ok', 'update_available', 'update_required']);
export type AppVersionStatus = z.infer<typeof AppVersionStatusSchema>;

export const AppVersionCheckResultSchema = z.object({
  status: AppVersionStatusSchema,
  latestVersion: z.string().nullable(),
  storeUrl: z.string().nullable(),
  releaseNotes: z.string().nullable(),
});
export type AppVersionCheckResult = z.infer<typeof AppVersionCheckResultSchema>;
