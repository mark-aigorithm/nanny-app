# Force Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins record mobile releases per platform and can mark one mandatory; the app checks its installed version on launch/foreground and blocks (mandatory) or nudges (optional) outdated users.

**Architecture:** A new `AppRelease` table and a public `GET /app-version/check` endpoint decide `ok | update_available | update_required` on the backend, using a semver comparator shared from `@nanny-app/shared`. The admin console gets a CRUD page under the existing `settings` section. The mobile app mounts an `UpdateGate` overlay (same pattern as `OfflineGate`) that renders a blocking screen or a dismissible sheet from that answer, and fails open on any error.

**Tech Stack:** Zod (shared), Express + Prisma + Jest/supertest (backend), React + Vite + Vitest/MSW (admin), Expo + React Query + Jest/RNTL (mobile), `expo-application` (new).

**Spec:** `docs/superpowers/specs/2026-10-19-force-update-design.md`

**Worktree:** `/home/mark/projects/nanny-app-wt-force-update`, branch `feat/force-update`. Every command below runs from that root unless it says otherwise. Run `pnpm install` once before Task 1.

## Global Constraints

- Platforms on the API are lower-case `'ios' | 'android'`; Prisma uses the existing `DevicePlatform` enum (`IOS` / `ANDROID`).
- Versions are strict semver `x.y.z` (`/^\d+\.\d+\.\d+$/`), compared numerically per segment — never lexically.
- Fail open: an invalid client version, no releases, a request error or an unknown status must never block the user.
- `(platform, version)` is unique among non-deleted rows (service-level check, 409 on clash); deletes are soft (`deletedAt`).
- Only `mandatory` and `releaseNotes` are editable; platform/version are immutable.
- `releaseNotes` ≤ 1000 chars, optional.
- Default store URLs: iOS `https://apps.apple.com/app/id6797044436`, Android `https://play.google.com/store/apps/details?id=com.nannyapp.mobile` (env `IOS_STORE_URL` / `ANDROID_STORE_URL`).
- Admin routes are gated by section `settings`: GET → `VIEW`, writes → `MANAGE`.
- No `any`, no `process.env` outside `src/lib/config.ts`, `import type` for types, kebab-case files (mobile components/screens keep their existing PascalCase file names).
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01QmwytREx2zyYzVDNKNUyY2
  ```

## Review Focus

1. **Lexical version ordering** — `1.10.0` must beat `1.9.0` everywhere (backend "latest", admin table order). Pinned in Task 1 and Task 2.
2. **A native version that isn't strict semver** (e.g. `1.4` or `1.4.0-beta`) — must resolve to `ok`, not 400 and not blocked. Pinned in Task 2 (service) and Task 3 (route).
3. **Deleting the only mandatory release** — users must stop being blocked immediately. Pinned in Task 3.
4. **"Later" on an optional prompt followed by a mandatory release** — the dismissal must not suppress the blocker. Pinned in Task 5.
5. **Platform the API doesn't know** (`web` in the Expo preview, or `IOS` upper-case) — mobile must not call the endpoint for web; backend must 400 on a bad platform rather than treat it as `ok` silently. Pinned in Task 3 and Task 5.

---

### Task 1: Shared schemas and version comparator

**Files:**
- Create: `packages/shared/src/app-release.ts`
- Modify: `packages/shared/src/index.ts` (add `export * from './app-release';`)
- Test: `packages/shared/src/__tests__/app-release.test.ts`

**Interfaces:**
- Produces:
  - `isSemver(value: string): boolean`
  - `compareVersions(a: string, b: string): -1 | 0 | 1 | null`
  - `AppPlatformSchema`, type `AppPlatform = 'ios' | 'android'`
  - `AppReleaseSchema` / type `AppRelease = { id: number; platform: AppPlatform; version: string; mandatory: boolean; releaseNotes: string | null; createdAt: string }`
  - `CreateAppReleaseSchema` / `CreateAppReleaseInput = { platform; version; mandatory: boolean; releaseNotes?: string }`
  - `UpdateAppReleaseSchema` / `UpdateAppReleaseInput = { mandatory?: boolean; releaseNotes?: string | null }`
  - `AppVersionCheckQuerySchema` / `AppVersionCheckQuery = { platform: AppPlatform; version: string }`
  - `AppVersionStatusSchema` / `AppVersionStatus = 'ok' | 'update_available' | 'update_required'`
  - `AppVersionCheckResultSchema` / `AppVersionCheckResult = { status; latestVersion: string | null; storeUrl: string | null; releaseNotes: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/__tests__/app-release.test.ts
import { describe, expect, it } from 'vitest';

import {
  AppVersionCheckQuerySchema,
  compareVersions,
  CreateAppReleaseSchema,
  isSemver,
  UpdateAppReleaseSchema,
} from '../app-release';

describe('compareVersions', () => {
  it('orders by numeric segment, not by string', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns null when either side is not x.y.z', () => {
    expect(compareVersions('1.4', '1.4.0')).toBeNull();
    expect(compareVersions('1.4.0', '1.4.0-beta')).toBeNull();
    expect(compareVersions('', '1.0.0')).toBeNull();
  });
});

describe('isSemver', () => {
  it('accepts only three numeric segments', () => {
    expect(isSemver('0.0.1')).toBe(true);
    expect(isSemver('10.20.30')).toBe(true);
    expect(isSemver('1.4')).toBe(false);
    expect(isSemver('v1.4.0')).toBe(false);
    expect(isSemver('1.4.0 ')).toBe(false);
  });
});

describe('CreateAppReleaseSchema', () => {
  it('accepts a valid release and defaults mandatory to false', () => {
    const parsed = CreateAppReleaseSchema.parse({ platform: 'ios', version: '1.4.0' });
    expect(parsed).toEqual({ platform: 'ios', version: '1.4.0', mandatory: false });
  });

  it('rejects a non-semver version and an unknown platform', () => {
    expect(CreateAppReleaseSchema.safeParse({ platform: 'ios', version: '1.4' }).success).toBe(false);
    expect(CreateAppReleaseSchema.safeParse({ platform: 'IOS', version: '1.4.0' }).success).toBe(false);
  });

  it('caps release notes at 1000 characters', () => {
    const notes = 'x'.repeat(1001);
    expect(
      CreateAppReleaseSchema.safeParse({ platform: 'android', version: '1.0.0', releaseNotes: notes }).success,
    ).toBe(false);
  });
});

describe('UpdateAppReleaseSchema', () => {
  it('needs at least one field and ignores platform/version', () => {
    expect(UpdateAppReleaseSchema.safeParse({}).success).toBe(false);
    expect(UpdateAppReleaseSchema.parse({ mandatory: true, version: '9.9.9' })).toEqual({ mandatory: true });
    expect(UpdateAppReleaseSchema.parse({ releaseNotes: null })).toEqual({ releaseNotes: null });
  });
});

describe('AppVersionCheckQuerySchema', () => {
  it('accepts any version string so garbage can fail open downstream', () => {
    expect(AppVersionCheckQuerySchema.parse({ platform: 'android', version: '1.4' })).toEqual({
      platform: 'android',
      version: '1.4',
    });
  });

  it('rejects an unknown platform', () => {
    expect(AppVersionCheckQuerySchema.safeParse({ platform: 'web', version: '1.0.0' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nanny-app/shared test -- app-release`
Expected: FAIL — `Cannot find module '../app-release'`.

- [ ] **Step 3: Implement**

```ts
// packages/shared/src/app-release.ts
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
```

Add to `packages/shared/src/index.ts` (alphabetical position among the other `export *` lines):

```ts
export * from './app-release';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @nanny-app/shared test -- app-release && pnpm --filter @nanny-app/shared typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/app-release.ts packages/shared/src/index.ts packages/shared/src/__tests__/app-release.test.ts
git commit -m "feat(shared): app release schemas and semver comparator"
```

---

### Task 2: Backend data model and service

**Files:**
- Modify: `apps/backend/prisma/schema.prisma` (add model after `ServiceArea`)
- Create: `apps/backend/prisma/migrations/<generated>_add_app_releases/migration.sql` (generated)
- Modify: `apps/backend/src/lib/config.ts` (store URLs)
- Modify: `apps/backend/.env.example` (document the two optional vars)
- Create: `apps/backend/src/services/app-release.service.ts`
- Test: `apps/backend/src/__tests__/app-release.service.test.ts`

**Interfaces:**
- Consumes: Task 1 schemas/types and `compareVersions`, `isSemver`.
- Produces:
  - `listAppReleases(): Promise<AppRelease[]>`
  - `createAppRelease(input: CreateAppReleaseInput): Promise<AppRelease>`
  - `updateAppRelease(id: number, input: UpdateAppReleaseInput): Promise<AppRelease>`
  - `deleteAppRelease(id: number): Promise<{ id: number }>`
  - `checkAppVersion(query: AppVersionCheckQuery): Promise<AppVersionCheckResult>`
  - `config.storeUrls: { ios: string; android: string }`

- [ ] **Step 1: Add the Prisma model and migration**

In `apps/backend/prisma/schema.prisma`, after `model ServiceArea { … }`:

```prisma
/// A published mobile build, recorded by an admin. The newest mandatory row per
/// platform is the floor for "update required"; the newest row overall drives
/// "update available". Unique (platform, version) among live rows is enforced
/// in app-release.service.ts so a soft-deleted release can be re-added.
model AppRelease {
  id           Int            @id @default(autoincrement())
  platform     DevicePlatform
  version      String
  mandatory    Boolean        @default(false)
  releaseNotes String?        @map("release_notes")
  createdAt    DateTime       @default(now()) @map("created_at")
  updatedAt    DateTime       @updatedAt @map("updated_at")
  deletedAt    DateTime?      @map("deleted_at")

  @@index([platform])
  @@map("app_releases")
}
```

Run (needs the dev DB from `docker compose up -d`):

```bash
cd apps/backend && pnpm db:migrate:dev --name add_app_releases && pnpm db:generate
```

Expected: a new `prisma/migrations/<timestamp>_add_app_releases/migration.sql` creating `app_releases` and its index; Prisma client regenerated. Open the SQL and confirm it touches nothing else.

- [ ] **Step 2: Add store URLs to config**

In `apps/backend/src/lib/config.ts`, inside `ConfigSchema` (next to the other optional URLs):

```ts
  // Where the app's "update" button sends the user. Defaults are the live
  // listings (App Store id from eas.json, Android package from app.config.ts).
  IOS_STORE_URL: z.string().url().default('https://apps.apple.com/app/id6797044436'),
  ANDROID_STORE_URL: z
    .string()
    .url()
    .default('https://play.google.com/store/apps/details?id=com.nannyapp.mobile'),
```

And in the exported `config` object:

```ts
  storeUrls: { ios: raw.IOS_STORE_URL, android: raw.ANDROID_STORE_URL },
```

In `apps/backend/.env.example` add:

```bash
# Optional — store listings the app's "update" button opens (defaults are the live listings)
# IOS_STORE_URL=https://apps.apple.com/app/id6797044436
# ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.nannyapp.mobile
```

- [ ] **Step 3: Write the failing service tests**

```ts
// apps/backend/src/__tests__/app-release.service.test.ts
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    appRelease: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  checkAppVersion,
  createAppRelease,
  deleteAppRelease,
  listAppReleases,
  updateAppRelease,
} from '@backend/services/app-release.service';

const mockPrisma = prisma as unknown as {
  appRelease: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
};

const IOS_STORE = 'https://apps.apple.com/app/id6797044436';

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    platform: 'IOS',
    version: '1.0.0',
    mandatory: false,
    releaseNotes: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkAppVersion', () => {
  const check = (version: string) => checkAppVersion({ platform: 'ios', version });

  it('reads only live releases for the asked platform', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([]);
    await check('1.0.0');
    expect(mockPrisma.appRelease.findMany).toHaveBeenCalledWith({
      where: { platform: 'IOS', deletedAt: null },
    });
  });

  it('is ok with no releases recorded', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([]);
    expect(await check('1.0.0')).toEqual({
      status: 'ok',
      latestVersion: null,
      storeUrl: null,
      releaseNotes: null,
    });
  });

  it('is ok on the latest release', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ version: '1.2.0', mandatory: true })]);
    expect((await check('1.2.0')).status).toBe('ok');
  });

  it('is ok when ahead of every release (e.g. a TestFlight build)', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ version: '1.2.0', mandatory: true })]);
    expect((await check('1.3.0')).status).toBe('ok');
  });

  it('offers an optional update with the latest notes and store link', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.0.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.1.0', releaseNotes: 'Faster booking' }),
    ]);
    expect(await check('1.0.0')).toEqual({
      status: 'update_available',
      latestVersion: '1.1.0',
      storeUrl: IOS_STORE,
      releaseNotes: 'Faster booking',
    });
  });

  it('requires an update below the newest mandatory release, even when a newer optional one exists', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.1.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.2.0', mandatory: false, releaseNotes: 'Latest' }),
    ]);
    const result = await check('1.0.5');
    expect(result.status).toBe('update_required');
    expect(result.latestVersion).toBe('1.2.0');
    expect(result.storeUrl).toBe(IOS_STORE);
  });

  it('only offers an update when above the mandatory floor but below the latest', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.1.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.2.0' }),
    ]);
    expect((await check('1.1.0')).status).toBe('update_available');
  });

  it('compares numerically: 1.10.0 is newer than 1.9.0', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.10.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.9.0', mandatory: true }),
    ]);
    expect((await check('1.9.0')).status).toBe('update_required');
    expect((await check('1.10.0')).status).toBe('ok');
  });

  it.each(['1.4', '1.4.0-beta', '', 'garbage'])('fails open on a malformed client version %p', async (version) => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ version: '9.0.0', mandatory: true })]);
    expect((await check(version)).status).toBe('ok');
  });

  it('uses the Android store link for Android', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ platform: 'ANDROID', version: '2.0.0', mandatory: true }),
    ]);
    const result = await checkAppVersion({ platform: 'android', version: '1.0.0' });
    expect(mockPrisma.appRelease.findMany).toHaveBeenCalledWith({
      where: { platform: 'ANDROID', deletedAt: null },
    });
    expect(result.storeUrl).toBe('https://play.google.com/store/apps/details?id=com.nannyapp.mobile');
  });
});

describe('listAppReleases', () => {
  it('returns live releases as DTOs with lower-case platforms', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ platform: 'ANDROID' })]);
    expect(await listAppReleases()).toEqual([
      {
        id: 1,
        platform: 'android',
        version: '1.0.0',
        mandatory: false,
        releaseNotes: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    expect(mockPrisma.appRelease.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('createAppRelease', () => {
  it('creates a release', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(null);
    mockPrisma.appRelease.create.mockResolvedValue(makeRelease({ version: '1.4.0', mandatory: true }));
    const created = await createAppRelease({ platform: 'ios', version: '1.4.0', mandatory: true });
    expect(mockPrisma.appRelease.create).toHaveBeenCalledWith({
      data: { platform: 'IOS', version: '1.4.0', mandatory: true, releaseNotes: null },
    });
    expect(created.version).toBe('1.4.0');
  });

  it('refuses a duplicate live version on the same platform', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(makeRelease({ version: '1.4.0' }));
    await expect(
      createAppRelease({ platform: 'ios', version: '1.4.0', mandatory: false }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.appRelease.findFirst).toHaveBeenCalledWith({
      where: { platform: 'IOS', version: '1.4.0', deletedAt: null },
    });
  });
});

describe('updateAppRelease', () => {
  it('changes mandatory and notes only', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(makeRelease());
    mockPrisma.appRelease.update.mockResolvedValue(makeRelease({ mandatory: true, releaseNotes: null }));
    await updateAppRelease(1, { mandatory: true, releaseNotes: null });
    expect(mockPrisma.appRelease.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { mandatory: true, releaseNotes: null },
    });
  });

  it('404s on a missing release', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(null);
    await expect(updateAppRelease(99, { mandatory: true })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('deleteAppRelease', () => {
  it('soft-deletes', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(makeRelease());
    expect(await deleteAppRelease(1)).toEqual({ id: 1 });
    expect(mockPrisma.appRelease.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
```

Before running, open `apps/backend/src/lib/errors.ts` and confirm the status property name on thrown errors (`statusCode` is assumed above); if it differs, use the real name in the three `toMatchObject` calls.

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @nanny-app/backend test:unit -- app-release.service`
Expected: FAIL — cannot find module `@backend/services/app-release.service`.

- [ ] **Step 5: Implement the service**

```ts
// apps/backend/src/services/app-release.service.ts
import {
  compareVersions,
  isSemver,
  type AppPlatform,
  type AppRelease,
  type AppVersionCheckQuery,
  type AppVersionCheckResult,
  type CreateAppReleaseInput,
  type UpdateAppReleaseInput,
} from '@nanny-app/shared';
import type { DevicePlatform } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';

type AppReleaseRow = {
  id: number;
  platform: DevicePlatform;
  version: string;
  mandatory: boolean;
  releaseNotes: string | null;
  createdAt: Date;
};

const TO_PRISMA: Record<AppPlatform, DevicePlatform> = { ios: 'IOS', android: 'ANDROID' };
const FROM_PRISMA: Record<DevicePlatform, AppPlatform> = { IOS: 'ios', ANDROID: 'android' };

function toDto(row: AppReleaseRow): AppRelease {
  return {
    id: row.id,
    platform: FROM_PRISMA[row.platform],
    version: row.version,
    mandatory: row.mandatory,
    releaseNotes: row.releaseNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAppReleases(): Promise<AppRelease[]> {
  const rows = await prisma.appRelease.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

export async function createAppRelease(input: CreateAppReleaseInput): Promise<AppRelease> {
  const platform = TO_PRISMA[input.platform];
  const clash = await prisma.appRelease.findFirst({
    where: { platform, version: input.version, deletedAt: null },
  });
  if (clash) {
    throw errors.conflict(`Version ${input.version} is already recorded for ${input.platform}`);
  }
  const row = await prisma.appRelease.create({
    data: {
      platform,
      version: input.version,
      mandatory: input.mandatory,
      releaseNotes: input.releaseNotes || null,
    },
  });
  return toDto(row);
}

export async function updateAppRelease(
  id: number,
  input: UpdateAppReleaseInput,
): Promise<AppRelease> {
  const existing = await prisma.appRelease.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Release not found');
  const row = await prisma.appRelease.update({
    where: { id },
    data: {
      ...(input.mandatory !== undefined && { mandatory: input.mandatory }),
      ...(input.releaseNotes !== undefined && { releaseNotes: input.releaseNotes || null }),
    },
  });
  return toDto(row);
}

export async function deleteAppRelease(id: number): Promise<{ id: number }> {
  const existing = await prisma.appRelease.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Release not found');
  await prisma.appRelease.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/**
 * What the app should do about its installed version. Fails open: a client
 * version that isn't x.y.z, or a platform with nothing recorded, is "ok" —
 * a bad build or an empty table must never lock anyone out.
 */
export async function checkAppVersion(query: AppVersionCheckQuery): Promise<AppVersionCheckResult> {
  const rows = await prisma.appRelease.findMany({
    where: { platform: TO_PRISMA[query.platform], deletedAt: null },
  });
  const newestFirst = [...rows].sort((a, b) => compareVersions(b.version, a.version) ?? 0);
  const latest = newestFirst[0];
  if (!latest || !isSemver(query.version)) {
    return { status: 'ok', latestVersion: latest?.version ?? null, storeUrl: null, releaseNotes: null };
  }

  const latestMandatory = newestFirst.find((r) => r.mandatory);
  const isBelow = (version: string) => compareVersions(query.version, version) === -1;
  const status = latestMandatory && isBelow(latestMandatory.version)
    ? 'update_required'
    : isBelow(latest.version)
      ? 'update_available'
      : 'ok';

  return {
    status,
    latestVersion: latest.version,
    storeUrl: status === 'ok' ? null : config.storeUrls[query.platform],
    releaseNotes: status === 'ok' ? null : latest.releaseNotes,
  };
}
```

Note: the "no releases" test expects `latestVersion: null` — satisfied because `latest` is undefined there.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @nanny-app/backend test:unit -- app-release.service && pnpm --filter @nanny-app/backend typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/prisma apps/backend/src/lib/config.ts apps/backend/.env.example apps/backend/src/services/app-release.service.ts apps/backend/src/__tests__/app-release.service.test.ts
git commit -m "feat(backend): app releases table and version check service"
```

---

### Task 3: Backend routes, permissions and integration journey

**Files:**
- Create: `apps/backend/src/routes/app-version.routes.ts`
- Modify: `apps/backend/src/routes/index.ts` (mount `/app-version`)
- Modify: `apps/backend/src/routes/admin.routes.ts` (add an "App releases" block after Certifications)
- Modify: `apps/backend/src/lib/admin-permissions.ts` (4 entries, after the legal-documents lines)
- Test: `apps/backend/src/__integration__/journeys/a40-app-releases.test.ts`

**Interfaces:**
- Consumes: Task 2 service functions; Task 1 `CreateAppReleaseSchema`, `UpdateAppReleaseSchema`, `AppVersionCheckQuerySchema`, type `AppVersionCheckQuery`.
- Produces (HTTP):
  - `GET /app-version/check?platform=ios|android&version=x.y.z` → `{ data: AppVersionCheckResult, error: null }`, no auth; 400 on an unknown platform.
  - `GET /admin/app-releases` → `AppRelease[]`; `POST /admin/app-releases` → 201 `AppRelease`; `PATCH /admin/app-releases/:id` → `AppRelease`; `DELETE /admin/app-releases/:id` → `{ id }`.

- [ ] **Step 1: Write the failing integration journey**

(Journey numbers a35–a39 are taken on other branches; use a40.)

```ts
// apps/backend/src/__integration__/journeys/a40-app-releases.test.ts
/**
 * A40 — force update. An admin records releases per platform; the public
 * check (no sign-in needed) tells the app whether it is current, has an
 * optional update, or must update. Deleting the mandatory release lifts the
 * block at once. Only operators with Booking Options access can manage it.
 */
import request from 'supertest';

import { app } from '@backend/app';

import { authHeader } from '../../../test/auth';
import { makeAdmin, makeOperator } from '../../../test/factories';

async function addRelease(
  adminToken: string,
  body: { platform: 'ios' | 'android'; version: string; mandatory?: boolean; releaseNotes?: string },
) {
  const res = await request(app).post('/admin/app-releases').set(...authHeader(adminToken)).send(body);
  expect(res.status).toBe(201);
  return res.body.data as { id: number };
}

function check(platform: string, version: string) {
  return request(app).get('/app-version/check').query({ platform, version });
}

describe('A40 — the public version check', () => {
  it('is ok with nothing recorded, and needs no sign-in', async () => {
    const res = await check('ios', '1.0.0');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'ok', latestVersion: null, storeUrl: null, releaseNotes: null });
  });

  it('answers required / available / ok by where the version sits, per platform', async () => {
    const admin = await makeAdmin();
    await addRelease(admin.token, { platform: 'ios', version: '1.1.0', mandatory: true });
    await addRelease(admin.token, { platform: 'ios', version: '1.2.0', releaseNotes: 'Chat with your nanny' });

    expect((await check('ios', '1.0.0')).body.data.status).toBe('update_required');
    const available = (await check('ios', '1.1.0')).body.data;
    expect(available).toEqual({
      status: 'update_available',
      latestVersion: '1.2.0',
      storeUrl: 'https://apps.apple.com/app/id6797044436',
      releaseNotes: 'Chat with your nanny',
    });
    expect((await check('ios', '1.2.0')).body.data.status).toBe('ok');
    // Android has nothing recorded, so iOS releases don't touch it.
    expect((await check('android', '1.0.0')).body.data.status).toBe('ok');
  });

  it('lifts the block as soon as the mandatory release is deleted', async () => {
    const admin = await makeAdmin();
    const mandatory = await addRelease(admin.token, { platform: 'android', version: '2.0.0', mandatory: true });
    expect((await check('android', '1.0.0')).body.data.status).toBe('update_required');

    await request(app).delete(`/admin/app-releases/${mandatory.id}`).set(...authHeader(admin.token));

    expect((await check('android', '1.0.0')).body.data.status).toBe('ok');
  });

  it('lifts the block when the release is made optional', async () => {
    const admin = await makeAdmin();
    const release = await addRelease(admin.token, { platform: 'ios', version: '3.0.0', mandatory: true });
    await request(app)
      .patch(`/admin/app-releases/${release.id}`)
      .set(...authHeader(admin.token))
      .send({ mandatory: false });

    expect((await check('ios', '2.0.0')).body.data.status).toBe('update_available');
  });

  it('fails open on a version that is not x.y.z', async () => {
    const admin = await makeAdmin();
    await addRelease(admin.token, { platform: 'ios', version: '5.0.0', mandatory: true });
    const res = await check('ios', '1.4');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('refuses an unknown platform', async () => {
    expect((await check('web', '1.0.0')).status).toBe(400);
    expect((await check('IOS', '1.0.0')).status).toBe(400);
  });
});

describe('A40 — managing releases', () => {
  it('refuses a duplicate version on the same platform, allows it on the other', async () => {
    const admin = await makeAdmin();
    await addRelease(admin.token, { platform: 'ios', version: '1.0.0' });
    const dup = await request(app)
      .post('/admin/app-releases')
      .set(...authHeader(admin.token))
      .send({ platform: 'ios', version: '1.0.0' });
    expect(dup.status).toBe(409);
    await addRelease(admin.token, { platform: 'android', version: '1.0.0' });
  });

  it('allows re-adding a version after deleting it', async () => {
    const admin = await makeAdmin();
    const first = await addRelease(admin.token, { platform: 'ios', version: '1.0.0' });
    await request(app).delete(`/admin/app-releases/${first.id}`).set(...authHeader(admin.token));
    await addRelease(admin.token, { platform: 'ios', version: '1.0.0' });
  });

  it('gates on Booking Options access: none → 403, VIEW reads, MANAGE writes', async () => {
    const none = await makeOperator({});
    const viewer = await makeOperator({ settings: 'VIEW' });
    const manager = await makeOperator({ settings: 'MANAGE' });

    expect((await request(app).get('/admin/app-releases').set(...authHeader(none.token))).status).toBe(403);
    expect((await request(app).get('/admin/app-releases').set(...authHeader(viewer.token))).status).toBe(200);
    const viewerWrite = await request(app)
      .post('/admin/app-releases')
      .set(...authHeader(viewer.token))
      .send({ platform: 'ios', version: '1.0.0' });
    expect(viewerWrite.status).toBe(403);
    await addRelease(manager.token, { platform: 'ios', version: '1.0.0' });
  });
});
```

- [ ] **Step 2: Start the test stack and run to verify failure**

```bash
pnpm test:env
pnpm --filter @nanny-app/backend test:integration -- a40-app-releases
```

If the stack is already running for the surveys session, reuse it (it is shared; tests truncate tables per test). Apply the new migration to the test DB first if the harness does not do it automatically — check `apps/backend/test/setup-integration.ts` for how migrations are applied.

Expected: FAIL — 404 on `/admin/app-releases` and `/app-version/check`.

- [ ] **Step 3: Add the public router**

```ts
// apps/backend/src/routes/app-version.routes.ts
import { AppVersionCheckQuerySchema, type AppVersionCheckQuery } from '@nanny-app/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { validateQuery } from '@backend/middleware/validate.middleware';
import { checkAppVersion } from '@backend/services/app-release.service';

export const appVersionRouter = Router();

// Public by design: the app checks before anyone signs in, and the answer
// (which versions are current) is not secret.
appVersionRouter.get(
  '/check',
  validateQuery(AppVersionCheckQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as AppVersionCheckQuery;
      res.json(ok(await checkAppVersion(query)));
    } catch (err) {
      next(err);
    }
  },
);
```

In `apps/backend/src/routes/index.ts` add the import alphabetically (`import { appVersionRouter } from './app-version.routes';` after `adminRouter`) and mount it after `/addresses`:

```ts
apiRouter.use('/app-version', appVersionRouter);
```

- [ ] **Step 4: Add the admin routes**

In `apps/backend/src/routes/admin.routes.ts`, extend the `@nanny-app/shared` import with `CreateAppReleaseSchema, UpdateAppReleaseSchema`, add

```ts
import {
  createAppRelease,
  deleteAppRelease,
  listAppReleases,
  updateAppRelease,
} from '@backend/services/app-release.service';
```

and after the Certifications block:

```ts
// ── App releases (force update) ────────────────────────────────

adminRouter.get('/app-releases', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listAppReleases()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/app-releases',
  validateBody(CreateAppReleaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createAppRelease(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/app-releases/:id',
  validateBody(UpdateAppReleaseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateAppRelease(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/app-releases/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await deleteAppRelease(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: Register permissions**

In `apps/backend/src/lib/admin-permissions.ts`, after the `legal-documents` lines:

```ts
  { method: 'GET', pattern: '/app-releases', requires: section('settings', 'VIEW') },
  { method: 'POST', pattern: '/app-releases', requires: section('settings', 'MANAGE') },
  { method: 'PATCH', pattern: '/app-releases/:id', requires: section('settings', 'MANAGE') },
  { method: 'DELETE', pattern: '/app-releases/:id', requires: section('settings', 'MANAGE') },
```

- [ ] **Step 6: Run integration, unit and typecheck**

```bash
pnpm --filter @nanny-app/backend test:integration -- a40-app-releases
pnpm --filter @nanny-app/backend test:unit
pnpm --filter @nanny-app/backend typecheck && pnpm --filter @nanny-app/backend lint
```

Expected: all PASS (the full unit run includes `admin-permissions.test.ts`, which guards that every admin route has a permission entry).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes apps/backend/src/lib/admin-permissions.ts apps/backend/src/__integration__/journeys/a40-app-releases.test.ts
git commit -m "feat(backend): public app version check and admin release endpoints"
```

---

### Task 4: Admin "App Releases" page

**Files:**
- Modify: `apps/admin/src/lib/api.ts` (4 functions after the certification ones)
- Create: `apps/admin/src/features/app-releases/app-release-form.tsx`
- Create: `apps/admin/src/features/app-releases/app-release-table.tsx`
- Create: `apps/admin/src/pages/app-releases-page.tsx`
- Modify: `apps/admin/src/app.tsx` (route after `settings`)
- Modify: `apps/admin/src/components/ui/icon.tsx` (export `Smartphone` under Navigation)
- Modify: `apps/admin/src/components/admin-layout.tsx` (nav item after Booking Options)
- Test: `apps/admin/src/pages/__tests__/app-releases-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 types/schemas and `compareVersions`; Task 3 HTTP endpoints.
- Produces: `fetchAppReleases(): Promise<AppRelease[]>`, `createAppRelease(input)`, `updateAppRelease(id, input)`, `deleteAppRelease(id)`; `AppReleasesPage`; query key `['app-releases']`.

**Before writing UI, load the `nanny-app-admin-design` skill** and follow it for spacing, badges and copy.

- [ ] **Step 1: Write the failing page test**

```tsx
// apps/admin/src/pages/__tests__/app-releases-page.test.tsx
/**
 * App Releases is the Certifications-style table over recorded mobile builds.
 * Pinned here: newest version first by semver (1.10.0 above 1.9.0), creating
 * a mandatory release asks for confirmation first, and the payload is right.
 */
import type { AdminUser, AppRelease } from '@nanny-app/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ToastProvider } from '@admin/components/ui';
import { PermissionsProvider } from '@admin/lib/permissions';
import { AppReleasesPage } from '@admin/pages/app-releases-page';
import { renderWithProviders } from '@admin/test/render';
import { server } from '@admin/test/server';

const ok = <T,>(data: T) => HttpResponse.json({ data, error: null });

const ADMIN: AdminUser = {
  id: 1, name: 'Ops Admin', email: 'ops@example.com', role: 'ADMIN',
  permissions: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z',
};

const release = (overrides: Partial<AppRelease>): AppRelease => ({
  id: 1, platform: 'ios', version: '1.0.0', mandatory: false, releaseNotes: null,
  createdAt: '2026-10-01T00:00:00.000Z', ...overrides,
});

function renderPage() {
  return renderWithProviders(
    <ToastProvider>
      <PermissionsProvider>
        <AppReleasesPage />
      </PermissionsProvider>
    </ToastProvider>,
  );
}

describe('AppReleasesPage', () => {
  it('explains the empty state', async () => {
    server.use(http.get('/api/admin/me', () => ok(ADMIN)), http.get('/api/admin/app-releases', () => ok([])));
    renderPage();
    expect(await screen.findByText(/no releases recorded/i)).toBeInTheDocument();
  });

  it('lists newest version first by semver, with a Mandatory badge', async () => {
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () =>
        ok([
          release({ id: 1, version: '1.9.0' }),
          release({ id: 2, version: '1.10.0', mandatory: true }),
        ]),
      ),
    );
    renderPage();
    await screen.findByText('1.10.0');
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('1.10.0')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Mandatory')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('1.9.0')).toBeInTheDocument();
  });

  it('confirms before creating a mandatory release, then sends it', async () => {
    let body: unknown;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () => ok([])),
      http.post('/api/admin/app-releases', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: release({ version: '2.0.0', mandatory: true }), error: null }, { status: 201 });
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add release/i }));
    await userEvent.type(screen.getByLabelText(/version/i), '2.0.0');
    await userEvent.click(screen.getByLabelText(/mandatory/i));
    await userEvent.click(screen.getByRole('button', { name: /^add release$/i, hidden: false }));

    expect(await screen.findByText(/only make this mandatory once/i)).toBeInTheDocument();
    expect(body).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: /make mandatory/i }));

    await waitFor(() =>
      expect(body).toEqual({ platform: 'ios', version: '2.0.0', mandatory: true }),
    );
  });

  it('rejects a version that is not x.y.z without calling the API', async () => {
    let called = false;
    server.use(
      http.get('/api/admin/me', () => ok(ADMIN)),
      http.get('/api/admin/app-releases', () => ok([])),
      http.post('/api/admin/app-releases', () => {
        called = true;
        return ok(release({}));
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add release/i }));
    await userEvent.type(screen.getByLabelText(/version/i), '1.4');
    await userEvent.click(screen.getByRole('button', { name: /^add release$/i }));
    expect(await screen.findByText(/version must look like 1\.4\.0/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
```

Note: the page's header button and the modal's submit are both "Add release". If `getByRole` finds two, scope the submit click with `within(screen.getByRole('dialog'))`. Check how `Field` associates its label (`getByLabelText` needs `htmlFor`/nesting); if it doesn't, query by placeholder instead.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @nanny-app/admin test -- app-releases-page`
Expected: FAIL — cannot resolve `@admin/pages/app-releases-page`.

- [ ] **Step 3: API functions**

In `apps/admin/src/lib/api.ts`, add the types to the `@nanny-app/shared` type import (`AppRelease, CreateAppReleaseInput, UpdateAppReleaseInput`) and after `deleteCertification`:

```ts
// ── App releases (force update) ────────────────────────────────

export async function fetchAppReleases(): Promise<AppRelease[]> {
  const res = await apiClient.get<ApiEnvelope<AppRelease[]>>('/admin/app-releases');
  return res.data.data;
}

export async function createAppRelease(input: CreateAppReleaseInput): Promise<AppRelease> {
  const res = await apiClient.post<ApiEnvelope<AppRelease>>('/admin/app-releases', input);
  return res.data.data;
}

export async function updateAppRelease(id: number, input: UpdateAppReleaseInput): Promise<AppRelease> {
  const res = await apiClient.patch<ApiEnvelope<AppRelease>>(`/admin/app-releases/${id}`, input);
  return res.data.data;
}

export async function deleteAppRelease(id: number): Promise<void> {
  await apiClient.delete(`/admin/app-releases/${id}`);
}
```

- [ ] **Step 4: Form modal**

```tsx
// apps/admin/src/features/app-releases/app-release-form.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  CreateAppReleaseSchema,
  UpdateAppReleaseSchema,
  type AppPlatform,
  type AppRelease,
} from '@nanny-app/shared';

import { ConfirmDialog, Field, FormModal, Input, Select, Switch, useToast } from '@admin/components/ui';
import { createAppRelease, updateAppRelease } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

export const PLATFORM_LABELS: Record<AppPlatform, string> = { ios: 'iOS', android: 'Android' };

type AppReleaseFormModalProps = {
  /** The release to edit; omit to add a new one. Only mandatory and notes are editable. */
  release?: AppRelease;
  onClose: () => void;
};

export function AppReleaseFormModal({ release, onClose }: AppReleaseFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [platform, setPlatform] = useState<AppPlatform>(release?.platform ?? 'ios');
  const [version, setVersion] = useState(release?.version ?? '');
  const [mandatory, setMandatory] = useState(release?.mandatory ?? false);
  const [releaseNotes, setReleaseNotes] = useState(release?.releaseNotes ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<(() => Promise<AppRelease>) | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AppRelease>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['app-releases'] });
      toast.success(release ? 'Release updated' : 'Release added', `${PLATFORM_LABELS[saved.platform]} ${saved.version}`);
      onClose();
    },
    onError: (err) => {
      setPendingSave(null);
      setFormError(apiErrorMessage(err));
    },
  });

  function submit() {
    setFormError(null);
    const notes = releaseNotes.trim();
    let save: () => Promise<AppRelease>;
    if (release) {
      const parsed = UpdateAppReleaseSchema.safeParse({ mandatory, releaseNotes: notes || null });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      save = () => updateAppRelease(release.id, parsed.data);
    } else {
      const parsed = CreateAppReleaseSchema.safeParse({
        platform,
        version: version.trim(),
        mandatory,
        ...(notes && { releaseNotes: notes }),
      });
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      save = () => createAppRelease(parsed.data);
    }
    // Turning "mandatory" on blocks every older install — make the admin confirm the build is live.
    const becomesMandatory = mandatory && !release?.mandatory;
    if (becomesMandatory) setPendingSave(() => save);
    else saveMutation.mutate(save);
  }

  return (
    <>
      <FormModal
        title={release ? `Edit ${PLATFORM_LABELS[release.platform]} ${release.version}` : 'Add release'}
        submitLabel={release ? 'Save changes' : 'Add release'}
        size="sm"
        busy={saveMutation.isPending}
        submitDisabled={!release && version.trim() === ''}
        error={formError}
        onSubmit={submit}
        onClose={onClose}
      >
        {!release && (
          <>
            <Field label="Platform">
              <Select
                value={platform}
                options={[
                  { value: 'ios', label: 'iOS' },
                  { value: 'android', label: 'Android' },
                ]}
                onChange={(value) => setPlatform(value as AppPlatform)}
              />
            </Field>
            <Field label="Version" hint="As shown in the store, e.g. 1.4.0.">
              <Input
                value={version}
                autoFocus
                onChange={(event) => setVersion(event.target.value)}
                placeholder="1.4.0"
              />
            </Field>
          </>
        )}
        <Field
          label="Mandatory"
          hint="Users on any older version are blocked until they update. Otherwise they get a prompt they can dismiss."
        >
          <Switch checked={mandatory} onChange={setMandatory} label={mandatory ? 'Mandatory' : 'Optional'} />
        </Field>
        <Field label="Release notes" hint="Optional — shown in the app's update prompt.">
          <textarea
            className="input"
            rows={3}
            maxLength={1000}
            value={releaseNotes}
            placeholder="Chat with your nanny during a booking."
            onChange={(event) => setReleaseNotes(event.target.value)}
          />
        </Field>
      </FormModal>

      {pendingSave && (
        <ConfirmDialog
          title="Make this release mandatory?"
          message={`Only make this mandatory once this build is live on the ${PLATFORM_LABELS[release?.platform ?? platform]} store — otherwise users will be blocked with nothing to install.`}
          confirmLabel="Make mandatory"
          busy={saveMutation.isPending}
          onConfirm={() => saveMutation.mutate(pendingSave)}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </>
  );
}
```

Check `ConfirmDialog`'s props in `components/ui/confirm-dialog.tsx` match (`title`, `message`, `confirmLabel`, `busy`, `onConfirm`, `onCancel` — as used by `certification-table.tsx`).

- [ ] **Step 5: Table**

```tsx
// apps/admin/src/features/app-releases/app-release-table.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { compareVersions, type AppRelease } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { AppReleaseFormModal, PLATFORM_LABELS } from '@admin/features/app-releases/app-release-form';
import { deleteAppRelease } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

/** iOS first, then newest version first — by semver, so 1.10.0 sits above 1.9.0. */
export function sortReleases(releases: AppRelease[]): AppRelease[] {
  return [...releases].sort(
    (a, b) => a.platform.localeCompare(b.platform) * -1 || (compareVersions(b.version, a.version) ?? 0),
  );
}

type AppReleaseTableProps = { releases: AppRelease[] };

export function AppReleaseTable({ releases }: AppReleaseTableProps) {
  const canManage = useCanManage('settings');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<AppRelease | null>(null);
  const [deleting, setDeleting] = useState<AppRelease | null>(null);
  const rows = useMemo(() => sortReleases(releases), [releases]);

  const deleteMutation = useMutation({
    mutationFn: deleteAppRelease,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app-releases'] });
      setDeleting(null);
      toast.success('Release deleted');
    },
    onError: (err) => toast.error('Couldn’t delete release', apiErrorMessage(err)),
  });

  const label = (r: AppRelease) => `${PLATFORM_LABELS[r.platform]} ${r.version}`;

  const columns: Column<AppRelease>[] = [
    { key: 'platform', header: 'Platform', render: (r) => PLATFORM_LABELS[r.platform] },
    { key: 'version', header: 'Version', render: (r) => r.version },
    {
      key: 'mandatory',
      header: 'Enforcement',
      render: (r) => (
        <Badge tone={r.mandatory ? 'danger' : 'neutral'}>{r.mandatory ? 'Mandatory' : 'Optional'}</Badge>
      ),
    },
    {
      key: 'notes',
      header: 'Release notes',
      render: (r) => r.releaseNotes ?? <span className="table-empty">—</span>,
    },
    { key: 'createdAt', header: 'Recorded', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    actionsColumn((r) => (
      <ActionMenu label={`Actions for ${label(r)}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(r)}>
          Edit
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(r)}>
          Delete
        </MenuItem>
      </ActionMenu>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty="No releases recorded — the app never prompts to update until you add one."
      />
      {editing && <AppReleaseFormModal release={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete release"
          message={`Delete ${label(deleting)}? If it was mandatory, older installs stop being blocked.`}
          confirmLabel="Delete release"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
```

Check `Badge`'s tone union in `components/ui/badge.tsx`; if `'danger'` isn't a tone, use the closest warning/error tone it offers. Check `Column`'s generic arity — certification-table passes two (`Column<Certification, CertificationSortKey>`); if the second is required, pass `string`.

- [ ] **Step 6: Page, route, nav**

```tsx
// apps/admin/src/pages/app-releases-page.tsx
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { AppReleaseFormModal } from '@admin/features/app-releases/app-release-form';
import { AppReleaseTable } from '@admin/features/app-releases/app-release-table';
import { fetchAppReleases } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function AppReleasesPage() {
  const canManage = useCanManage('settings');
  const [adding, setAdding] = useState(false);
  const { data: releases, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['app-releases'],
    queryFn: fetchAppReleases,
  });

  return (
    <section>
      <PageHeader
        title="App Releases"
        subtitle="Record each build once it is live in the store. Users below the newest mandatory release must update; users below the newest release get a prompt they can dismiss."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add release
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={6} />}
      {error != null && !releases && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {releases && (
        <>
          {error != null && (
            <StaleRefreshBanner message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
          )}
          <AppReleaseTable releases={releases} />
        </>
      )}
      {adding && <AppReleaseFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
```

`apps/admin/src/components/ui/icon.tsx` — add `Smartphone,` under `// Navigation`.

`apps/admin/src/app.tsx` — import `AppReleasesPage` and add after the `settings` route:

```tsx
                <Route
                  path="app-releases"
                  element={
                    <Guarded section="settings">
                      <AppReleasesPage />
                    </Guarded>
                  }
                />
```

`apps/admin/src/components/admin-layout.tsx` — import `Smartphone` from `./ui` and add after Booking Options:

```ts
  { to: '/app-releases', label: 'App Releases', icon: Smartphone, section: 'settings' },
```

- [ ] **Step 7: Run tests, typecheck, lint**

```bash
pnpm --filter @nanny-app/admin test -- app-releases-page
pnpm --filter @nanny-app/admin test
pnpm --filter @nanny-app/admin typecheck && pnpm --filter @nanny-app/admin lint
```

Expected: PASS. (If an existing sidebar/nav snapshot test lists nav items, update it for the new entry.)

- [ ] **Step 8: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): App Releases page to record builds and mark them mandatory"
```

---

### Task 5: Mobile update gate

**Files:**
- Modify: `apps/mobile/package.json` (add `expo-application` via `npx expo install`)
- Modify: `apps/mobile/jest.setup.js` (default mock for `expo-application`)
- Create: `apps/mobile/src/lib/dismissedUpdate.ts`
- Create: `apps/mobile/src/hooks/useAppVersionCheck.ts`
- Create: `apps/mobile/src/screens/UpdateRequiredScreen.tsx`
- Create: `apps/mobile/src/screens/styles/update-required-screen.styles.ts`
- Create: `apps/mobile/src/components/UpdateAvailableSheet.tsx`
- Create: `apps/mobile/src/components/UpdateGate.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (mount `<UpdateGate />` right before `<OfflineGate />`)
- Test: `apps/mobile/src/components/__tests__/UpdateGate.test.tsx`
- Test: `apps/mobile/src/hooks/__tests__/useAppVersionCheck.test.tsx`

**Interfaces:**
- Consumes: `GET /app-version/check`; Task 1 types `AppVersionCheckResult`, `AppPlatform`.
- Produces:
  - `installedAppVersion(): string | null`
  - `useAppVersionCheck(): UseQueryResult<AppVersionCheckResult>`; key `APP_VERSION_CHECK_KEY = 'app-version-check'`
  - `readDismissedUpdate(): Promise<string | null>`, `writeDismissedUpdate(version: string): Promise<void>`
  - `UpdateGate` (default export), `UpdateRequiredScreen` (default export, props `{ releaseNotes: string | null; onUpdate: () => void }`), `UpdateAvailableSheet` (default export, props `{ latestVersion: string; releaseNotes: string | null; onUpdate: () => void; onLater: () => void }`)

**Before writing UI, load the `nanny-app-mobile-design` skill** and read the "Rules from the UI sweep" in `apps/mobile/CLAUDE.md`.

- [ ] **Step 1: Add the dependency and its test mock**

```bash
cd apps/mobile && npx expo install expo-application
```

In `apps/mobile/jest.setup.js`, next to the other Expo module mocks:

```js
// The installed version the force-update check sends. Tests that care
// override `nativeApplicationVersion` with their own jest.mock(...).
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0' }));
```

- [ ] **Step 2: Write the failing hook test**

```tsx
// apps/mobile/src/hooks/__tests__/useAppVersionCheck.test.tsx
import React from 'react';
import { Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

import { api } from '@mobile/lib/api';
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';

const mockGet = api.get as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const originalOS = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS });
  jest.clearAllMocks();
});

it('asks the backend with the platform and the installed native version', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'android' });
  mockGet.mockResolvedValue({
    data: { data: { status: 'ok', latestVersion: null, storeUrl: null, releaseNotes: null }, error: null },
  });

  const { result } = renderHook(() => useAppVersionCheck(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockGet).toHaveBeenCalledWith('/app-version/check', {
    params: { platform: 'android', version: '1.0.0' },
  });
});

it('never calls the backend on a platform the API does not know (web preview)', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'web' });
  renderHook(() => useAppVersionCheck(), { wrapper });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockGet).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Write the failing gate test**

```tsx
// apps/mobile/src/components/__tests__/UpdateGate.test.tsx
import React from 'react';
import { BackHandler, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AppVersionCheckResult } from '@nanny-app/shared';

let mockCheck: { data?: AppVersionCheckResult; isError?: boolean } = {};
jest.mock('@mobile/hooks/useAppVersionCheck', () => ({
  useAppVersionCheck: () => mockCheck,
}));

const mockReadDismissed = jest.fn(async (): Promise<string | null> => null);
const mockWriteDismissed = jest.fn(async (_version: string) => undefined);
jest.mock('@mobile/lib/dismissedUpdate', () => ({
  readDismissedUpdate: () => mockReadDismissed(),
  writeDismissedUpdate: (version: string) => mockWriteDismissed(version),
}));

import UpdateGate from '@mobile/components/UpdateGate';

const STORE = 'https://apps.apple.com/app/id6797044436';
const REQUIRED_HEADLINE = 'Time to update';
const AVAILABLE_HEADLINE = 'A new version is available';

function result(overrides: Partial<AppVersionCheckResult>): AppVersionCheckResult {
  return { status: 'ok', latestVersion: '1.2.0', storeUrl: STORE, releaseNotes: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck = {};
  mockReadDismissed.mockResolvedValue(null);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => jest.restoreAllMocks());

it('renders nothing while the check is loading, failed, or ok', async () => {
  const { queryByText, rerender } = render(<UpdateGate />);
  await act(async () => {});
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();

  mockCheck = { isError: true };
  rerender(<UpdateGate />);
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();

  mockCheck = { data: result({ status: 'ok', storeUrl: null }) };
  rerender(<UpdateGate />);
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();
});

it('blocks with notes and sends "Update now" to the store', async () => {
  mockCheck = { data: result({ status: 'update_required', releaseNotes: 'Chat with your nanny' }) };
  const { findByText, getByText } = render(<UpdateGate />);

  expect(await findByText(REQUIRED_HEADLINE)).toBeTruthy();
  expect(getByText('Chat with your nanny')).toBeTruthy();
  fireEvent.press(getByText('Update now'));
  expect(Linking.openURL).toHaveBeenCalledWith(STORE);
  expect(() => getByText('Later')).toThrow();
});

it('swallows the Android back button while blocking', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener');
  mockCheck = { data: result({ status: 'update_required' }) };
  const { findByText } = render(<UpdateGate />);
  await findByText(REQUIRED_HEADLINE);

  const handler = add.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
  expect(handler?.()).toBe(true);
});

it('offers an optional update; "Later" remembers the version and hides it', async () => {
  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.2.0' }) };
  const { findByText, getByText, queryByText } = render(<UpdateGate />);

  expect(await findByText(AVAILABLE_HEADLINE)).toBeTruthy();
  await act(async () => {
    fireEvent.press(getByText('Later'));
  });

  expect(mockWriteDismissed).toHaveBeenCalledWith('1.2.0');
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();
});

it('stays quiet for a version already dismissed, but prompts for a newer one', async () => {
  mockReadDismissed.mockResolvedValue('1.2.0');
  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.2.0' }) };
  const { queryByText, rerender, findByText } = render(<UpdateGate />);
  await act(async () => {});
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();

  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.3.0' }) };
  rerender(<UpdateGate />);
  expect(await findByText(AVAILABLE_HEADLINE)).toBeTruthy();
});

it('still blocks when the same version was dismissed as optional before being made mandatory', async () => {
  mockReadDismissed.mockResolvedValue('1.2.0');
  mockCheck = { data: result({ status: 'update_required', latestVersion: '1.2.0' }) };
  const { findByText } = render(<UpdateGate />);
  expect(await findByText(REQUIRED_HEADLINE)).toBeTruthy();
});

it('renders nothing when the backend sends no store link', async () => {
  mockCheck = { data: result({ status: 'update_required', storeUrl: null }) };
  const { queryByText } = render(<UpdateGate />);
  await act(async () => {});
  await waitFor(() => expect(queryByText(REQUIRED_HEADLINE)).toBeNull());
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm --filter @nanny-app/mobile test -- UpdateGate useAppVersionCheck`
Expected: FAIL — modules not found.

- [ ] **Step 5: Implement storage helper and hook**

```ts
// apps/mobile/src/lib/dismissedUpdate.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

// The newest optional version the user chose "Later" for. The prompt comes
// back only when a newer version is released; a mandatory update ignores it.
const KEY = 'dismissed-update-version';

export async function readDismissedUpdate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeDismissedUpdate(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, version);
  } catch {
    // Best effort — worst case the prompt shows again next launch.
  }
}
```

```ts
// apps/mobile/src/hooks/useAppVersionCheck.ts
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import type { AppPlatform, AppVersionCheckResult } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';

export const APP_VERSION_CHECK_KEY = 'app-version-check';

/** The version the store installed; the JS config version only as a fallback (e.g. Expo Go). */
export function installedAppVersion(): string | null {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
}

function apiPlatform(): AppPlatform | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

/**
 * Whether this install is current. Runs without sign-in, again whenever the
 * app returns to the foreground (React Query's focusManager is bound to
 * AppState in the root layout). Errors are left to the caller, which fails open.
 */
export function useAppVersionCheck() {
  const platform = apiPlatform();
  const version = installedAppVersion();
  return useQuery({
    queryKey: [APP_VERSION_CHECK_KEY, platform, version],
    queryFn: () =>
      unwrap<AppVersionCheckResult>(
        api.get('/app-version/check', { params: { platform, version } }),
      ),
    enabled: platform !== null && version !== null,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 6: Implement the screen, sheet and gate**

```ts
// apps/mobile/src/screens/styles/update-required-screen.styles.ts
import { StyleSheet } from 'react-native';

import { colors, spacing, screenPadding, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
  },
  iconCircle: {
    marginBottom: spacing.xl,
  },
  headline: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  notes: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  footer: {
    paddingHorizontal: screenPadding,
  },
});
```

```tsx
// apps/mobile/src/screens/UpdateRequiredScreen.tsx
import React, { useEffect } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { colors, spacing } from '@mobile/theme';
import { Button, IconCircle, ScreenContainer } from '@mobile/components/ui';
import { styles } from './styles/update-required-screen.styles';

interface UpdateRequiredScreenProps {
  releaseNotes: string | null;
  onUpdate: () => void;
}

/**
 * Full-screen "update required" state. UpdateGate renders it over the whole
 * app when this install is below the newest mandatory release. There is no
 * way past it but the store: the Android back button is swallowed.
 */
export default function UpdateRequiredScreen({ releaseNotes, onUpdate }: UpdateRequiredScreenProps) {
  const bottomPadding = useBottomBarPadding(spacing['4xl']);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  return (
    <ScreenContainer useSafeArea={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconCircle
          icon="arrow-up-circle-outline"
          size="xl"
          backgroundColor={colors.warmSubtle}
          iconColor={colors.primaryDark}
          style={styles.iconCircle}
        />
        <Text style={styles.headline}>Time to update</Text>
        <Text style={styles.body}>
          This version of the app is no longer supported. Update to keep booking and managing care.
        </Text>
        {releaseNotes ? <Text style={styles.notes}>{releaseNotes}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
        <Button title="Update now" onPress={onUpdate} />
      </View>
    </ScreenContainer>
  );
}
```

```tsx
// apps/mobile/src/components/UpdateAvailableSheet.tsx
import React from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@mobile/components/ui/text';

import { Button } from '@mobile/components/ui';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { borderRadius, colors, screenPadding, shadows, spacing, typeScale } from '@mobile/theme';

interface UpdateAvailableSheetProps {
  latestVersion: string;
  releaseNotes: string | null;
  onUpdate: () => void;
  onLater: () => void;
}

/** Dismissible "update available" prompt for an optional release. */
export default function UpdateAvailableSheet({
  latestVersion,
  releaseNotes,
  onUpdate,
  onLater,
}: UpdateAvailableSheetProps) {
  const bottomPadding = useBottomBarPadding(spacing['3xl']);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: bottomPadding }]}>
          <Text style={styles.headline}>A new version is available</Text>
          <Text style={styles.body}>Version {latestVersion} is ready in the store.</Text>
          {releaseNotes ? (
            <ScrollView style={styles.notesScroll}>
              <Text style={styles.notes}>{releaseNotes}</Text>
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            <Button title="Update" onPress={onUpdate} />
            <Button title="Later" variant="text" onPress={onLater} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing['2xl'],
    paddingHorizontal: screenPadding,
    ...shadows.lg,
  },
  headline: {
    ...typeScale.titleLg,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  notesScroll: {
    maxHeight: 160,
    marginTop: spacing.md,
  },
  notes: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
```

Before relying on them, confirm in `@mobile/theme` that `colors.overlay`, `colors.surface`, `borderRadius.xl`, `shadows.lg`, `typeScale.titleLg` and `typeScale.bodyMd` exist; `RatingPromptSheet.tsx` uses the same imports — copy its backdrop/sheet token names if any of these differ. Confirm `arrow-up-circle-outline` is an Ionicons name `IconCircle` accepts.

```tsx
// apps/mobile/src/components/UpdateGate.tsx
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import UpdateAvailableSheet from '@mobile/components/UpdateAvailableSheet';
import UpdateRequiredScreen from '@mobile/screens/UpdateRequiredScreen';
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';
import { readDismissedUpdate, writeDismissedUpdate } from '@mobile/lib/dismissedUpdate';
import { colors } from '@mobile/theme';

/**
 * Mount once in the root layout, beside OfflineGate. Asks the backend whether
 * this install is current and either covers the app (update required), offers
 * a dismissible prompt (update available) or stays out of the way. Fails open:
 * while loading, on any error, or without a store link it renders nothing.
 */
export default function UpdateGate() {
  const { data } = useAppVersionCheck();
  // undefined until storage has been read, so the sheet never flashes for a dismissed version.
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void readDismissedUpdate().then(setDismissed);
  }, []);

  if (!data || data.status === 'ok' || !data.storeUrl) return null;
  const storeUrl = data.storeUrl;
  const openStore = () => void Linking.openURL(storeUrl);

  if (data.status === 'update_required') {
    return (
      <View style={styles.overlay}>
        <UpdateRequiredScreen releaseNotes={data.releaseNotes} onUpdate={openStore} />
      </View>
    );
  }

  if (dismissed === undefined || !data.latestVersion || dismissed === data.latestVersion) return null;
  const latestVersion = data.latestVersion;

  return (
    <UpdateAvailableSheet
      latestVersion={latestVersion}
      releaseNotes={data.releaseNotes}
      onUpdate={openStore}
      onLater={() => {
        setDismissed(latestVersion);
        void writeDismissedUpdate(latestVersion);
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    // Above the router stack and root-mounted hosts; OfflineGate (mounted after) still wins when offline.
    zIndex: 1000,
    elevation: 1000,
  },
});
```

In `apps/mobile/app/_layout.tsx`, import `UpdateGate from '@mobile/components/UpdateGate'` next to the OfflineGate import, and render `<UpdateGate />` on the line directly before `<OfflineGate />` (so offline still covers it — retrying the check needs a network).

- [ ] **Step 7: Run tests, layout guards, typecheck, lint**

```bash
pnpm --filter @nanny-app/mobile test -- UpdateGate useAppVersionCheck layout-guards OfflineGate
pnpm --filter @nanny-app/mobile typecheck && pnpm --filter @nanny-app/mobile lint
```

Expected: PASS. If `layout-guards` flags a pattern in the new files, fix the file to the rule it names (don't relax the guard).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): force/optional update gate checked on launch and foreground"
```

---

### Task 6: Release docs and UI sweep

**Files:**
- Modify: the `releasing-a-new-build` skill file (find it with `ls .claude/skills` from the repo root; it's the skill of that name)
- Modify: `.claude/CLAUDE.md` (one row in "Decisions to Revisit")

- [ ] **Step 1: Update the release skill**

Add to its pre-build checklist:

```markdown
- **Bump `version` in `apps/mobile/app.config.ts`** (semver x.y.z) for every store release. The
  force-update check compares this version; two builds with the same version are indistinguishable to it.
```

And to its post-publish steps:

```markdown
- **Record the release** in the admin console → App Releases (platform + version) once the store has
  published it. Tick *Mandatory* only when every older install must stop working — and only after the
  build is live on that platform's store.
```

- [ ] **Step 2: Add a "Decisions to Revisit" row in `.claude/CLAUDE.md`**

```markdown
| Force update compares the native `version` string only (per platform, admin-recorded) | If releases ship without bumping `version`, switch to comparing build numbers (iOS buildNumber / Android versionCode) |
```

- [ ] **Step 3: UI sweep**

Invoke the `ui-sweep` skill for the two new surfaces: the "update required" screen (with and without long release notes) and the "update available" sheet. To render them, point a debug build at a local backend and add releases through the admin API (a mandatory `9.0.0` for the blocker; an optional `9.0.0` with the mandatory row deleted for the sheet). Fix any clipping or nav-bar overlap it reports, re-run the Task 5 tests, and commit the fixes together with this task.

- [ ] **Step 4: Full verification**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
pnpm --filter @nanny-app/backend test:integration -- a40-app-releases
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add .claude
git commit -m "docs: release checklist and decision note for force update"
```
