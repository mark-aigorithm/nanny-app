# Registration Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the validation gaps in registration:
- Adults only (18–100), a real calendar date.
- A fixed set of age bands, and only the current terms version.
- A street address and a profile photo from every account; the mother's photo is saved.
- Phone removed from `PATCH /auth/me`.
- Photo and ID URLs must point at the caller's own upload folder in our bucket.
- Revoked sessions refused where it matters.
- The OTP email must match the Firebase account.
- Racing registrations resolve to one account.
- Firebase's `emailVerified` re-synced on retries.

**Architecture:**
- Rules live once, as Zod schemas and helpers in `packages/shared`. The backend validates with them and the mobile wizard mirrors them on screen.
- The backend adds `lib/storage-url.ts` for the upload-URL check and a `requireFreshAuth` middleware (`verifyIdToken(token, true)`).
- `registerUser` gets three hardening changes: the OTP-email match, race recovery, and the `emailVerified` re-sync.
- On mobile, Step 1's DOB picker is capped at 18, Step 2 requires a street address, and Step 3 uploads the photo for both roles.

**Tech Stack:**
- `packages/shared`: Zod 3.23 with Vitest.
- `apps/backend`: Express, Prisma and Jest, with a `unit` project and an `integration` project (the latter on the local Auth emulator and PostGIS).
- `apps/mobile`: Expo 54, jest-expo and React Native Testing Library, with Maestro device flows.
- `apps/admin`: Playwright helpers.

**Spec:** `Docs/superpowers/specs/2026-09-24-registration-hardening-design.md` (plan 2 row). The task details are T1, T2 and T10's DOB and photo parts in `C:\Users\markb\.claude\plans\sunny-exploring-hummingbird.md`.

## Global Constraints

- **Branch:**
  - Commit on `feat/sign-in-landing`. The owner decided plans 1–4 ship as one PR from that branch, so there is no `feat/registration-validation` branch.
  - Run `git branch --show-current` before the first commit.
- **Commits:** stage files by name, never `git add -A` or `git add .`. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **TypeScript:** strict, with no `any`. Use `import type` for types. Types come from the shared Zod schemas; never duplicate them.
- **Copy (verbatim)** — the same strings on the server and in the app:
  - Under 18: `You must be at least 18 to use NannyNow.`
  - Unreal, future or over-100 DOB: `Please enter a valid date of birth.`
  - Empty DOB (mobile only, unchanged): `Please select your date of birth.`
  - Wrong terms version: `Please accept the latest terms to continue.`
  - Missing street address: `Please enter your street address.`
  - Missing photo in the API body: `Please add a profile photo.`
  - Foreign or unowned upload URL: `Upload the photo again.`
  - Revoked, disabled or deleted session on a fresh-auth route: `Your session has ended. Please sign in again.`
  - OTP email ≠ Firebase account email: `The email you verified doesn't match this account. Please start again.`
  - Unique clash with an unknown column: `An account with these details already exists.`
  - Mobile Step 3 upload failure: `Couldn't upload your photos. Check your connection and try again.`
  - Mobile Step 3 upload-in-progress button label: `Uploading photos…`
- **Constants:**
  - `MIN_REGISTRATION_AGE = 18` and `MAX_REGISTRATION_AGE = 100`.
  - `CURRENT_TERMS_VERSION = 'v1.0'`, which the app already sends.
  - `AGE_RANGES = ['0-1', '1-3', '3-5', '5+']`, which the app and the console already offer.
- **Scope:**
  - The age-band enum applies to `RegisterRequestSchema` only. Profile-edit and admin schemas keep `z.array(z.string())`, so a legacy value on an existing profile cannot block an edit.
  - `requireFreshAuth` goes on `POST /auth/register` and on the admin router. `DELETE /auth/me` and `/auth/reclaim-email` come in plans 3 and 4. `/auth/email` stays on `requireAuth`; its lost-response recovery relies on revoked tokens passing.
- **Tests and environment:**
  - Integration tests run only against the local test stack (`pnpm test:env`) and load `.env.test`. Never load `apps/backend/.env`; it points at live production.
  - Backend unit tests do not load an env file. Any unit test whose import graph reaches `@backend/lib/config` must `jest.mock('@backend/lib/config', …)`.
  - Mobile unit tests run from `apps/mobile`: `pnpm exec jest <path>`.
- **Style:** match the surrounding code's comment density and idiom. Comments explain *why*.

---

### Task 1: The registration contract, adopted everywhere

The schema changes ripple through every consumer's types, so this task changes the contract and makes every package compile and pass against it. There are no new server checks yet; those come in Tasks 2–3.

**Files:**
- Modify: `packages/shared/src/nanny.ts` (age bands)
- Modify: `packages/shared/src/auth.ts` (DOB helpers, terms constant, `RegisterRequestSchema`, `UpdateProfileRequestSchema`)
- Create: `packages/shared/src/__tests__/registration-rules.test.ts`
- Modify: `packages/shared/src/__tests__/register-nanny-required.test.ts`
- Modify: `apps/backend/src/services/auth.service.ts` (mother `avatarUrl` saved; phone removed from `updateProfile`)
- Modify: `apps/backend/src/routes/auth.routes.ts` (PATCH doc comment only)
- Create: `apps/backend/test/storage-url.ts`
- Modify: `apps/backend/test/auth.ts` (add `uidOf`)
- Modify (fixtures): `apps/backend/src/__tests__/auth-register-address.test.ts`, `auth-register-nanny-profile.test.ts`, `auth-service-id.test.ts`, `auth-firebase-email.test.ts`, `auth-availability.test.ts`
- Modify (fixtures): `apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts`, `a11-mother-id-gate.test.ts`, `a14-mother-email-gate.test.ts`, `a20-profiles.test.ts`, `a24-social-registration.test.ts`
- Modify (fixtures): `apps/backend/test/factories/user.ts:167`, `apps/backend/test/e2e/seed-mobile.ts:170`
- Modify: `apps/admin/e2e/helpers/backend.ts`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx` and its test
- Modify: `apps/mobile/src/screens/parent/AccountDetailsScreen.tsx`
- Modify: `apps/mobile/src/store/registrationDraftStore.ts` (`ageRanges: AgeRange[]`)

**Interfaces:**
- Produces (all exported from `@nanny-app/shared`):
  - `AGE_RANGES`: `readonly ['0-1','1-3','3-5','5+']`
  - `AgeRangeSchema` and `type AgeRange`
  - `MIN_REGISTRATION_AGE: 18` and `MAX_REGISTRATION_AGE: 100`
  - `ageOn(dateOfBirth: string, today?: Date): number | null`
  - `latestAllowedDob(today?: Date): Date`
  - `dateOfBirthError(dateOfBirth: string, today?: Date): string | null`
  - `DateOfBirthSchema`
  - `CURRENT_TERMS_VERSION: 'v1.0'`
- Produces (backend test helpers):
  - `storageUrl(folder: 'avatars' | 'nanny-ids', uid: string, file?: string): string` in `apps/backend/test/storage-url.ts`
  - `uidOf(idToken: string): string` in `apps/backend/test/auth.ts`
- `RegisterRequest` now has a required `avatarUrl: string`, a required `address: string`, `termsAcceptedVersion: 'v1.0'` and `ageRanges?: AgeRange[]`. `UpdateProfileRequest` has no `phone`.

- [ ] **Step 1: Write the failing shared tests.** Create `packages/shared/src/__tests__/registration-rules.test.ts`:

```ts
/**
 * Rules every sign-up is held to, whichever role and whichever door. The app
 * mirrors each one on screen; these pin the server-side half.
 */
import { describe, expect, it } from 'vitest';

import {
  CURRENT_TERMS_VERSION,
  MIN_REGISTRATION_AGE,
  RegisterRequestSchema,
  UpdateProfileRequestSchema,
  ageOn,
  dateOfBirthError,
  latestAllowedDob,
} from '../auth';
import { AGE_RANGES, AgeRangeSchema } from '../nanny';

// 24 September 2026, local time — the helpers take "today" so the tests don't
// age with the calendar.
const TODAY = new Date(2026, 8, 24);

const UNDERAGE = 'You must be at least 18 to use NannyNow.';
const INVALID = 'Please enter a valid date of birth.';

/** An ISO date `years` before now — for the schema, which always uses the real today. */
function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

const MOTHER = {
  firstName: 'Mona',
  lastName: 'Adel',
  email: 'mona@example.com',
  emailVerificationToken: 'tok',
  phone: '+201000000001',
  dateOfBirth: '1990-05-10',
  role: 'MOTHER',
  termsAcceptedVersion: CURRENT_TERMS_VERSION,
  address: '1 Test Street, Cairo',
  latitude: 30.0444,
  longitude: 31.2357,
  avatarUrl: 'https://s/o/avatar.jpg',
};

function firstMessage(body: Record<string, unknown>): string | null {
  const parsed = RegisterRequestSchema.safeParse(body);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? 'unknown';
}

describe('ageOn', () => {
  it('counts whole years, turning over on the birthday itself', () => {
    expect(ageOn('2008-09-24', TODAY)).toBe(18);
    expect(ageOn('2008-09-25', TODAY)).toBe(17);
  });

  it('refuses anything that is not a real calendar date', () => {
    expect(ageOn('2001-02-30', TODAY)).toBeNull();
    expect(ageOn('24/09/2001', TODAY)).toBeNull();
    expect(ageOn('', TODAY)).toBeNull();
  });
});

describe('latestAllowedDob', () => {
  it('is exactly MIN_REGISTRATION_AGE years before today', () => {
    const d = latestAllowedDob(TODAY);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026 - MIN_REGISTRATION_AGE, 8, 24]);
  });

  it('falls back to 28 February when today is a leap day', () => {
    const leapDay = new Date(2024, 1, 29);
    const d = latestAllowedDob(leapDay);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2006, 1, 28]);
    expect(ageOn('2006-02-28', leapDay)).toBe(18);
  });
});

describe('dateOfBirthError', () => {
  it('accepts 18 through 100', () => {
    expect(dateOfBirthError('2008-09-24', TODAY)).toBeNull();
    expect(dateOfBirthError('1926-09-24', TODAY)).toBeNull();
  });

  it('refuses someone under 18 with the age message', () => {
    expect(dateOfBirthError('2008-09-25', TODAY)).toBe(UNDERAGE);
  });

  it('refuses a future date, over 100, or a date that does not exist as invalid', () => {
    expect(dateOfBirthError('2027-01-01', TODAY)).toBe(INVALID);
    expect(dateOfBirthError('1925-09-23', TODAY)).toBe(INVALID);
    expect(dateOfBirthError('2001-02-30', TODAY)).toBe(INVALID);
  });
});

describe('RegisterRequestSchema — every account', () => {
  it('accepts a complete mother', () => {
    expect(firstMessage(MOTHER)).toBeNull();
  });

  it('needs a photo from a mother too', () => {
    expect(firstMessage({ ...MOTHER, avatarUrl: undefined })).toBe('Please add a profile photo.');
  });

  it('needs a street address from a mother too', () => {
    expect(firstMessage({ ...MOTHER, address: '' })).toBe('Please enter your street address.');
    expect(firstMessage({ ...MOTHER, address: '   ' })).toBe('Please enter your street address.');
    expect(firstMessage({ ...MOTHER, address: undefined })).toBe('Please enter your street address.');
  });

  it('holds the date of birth to 18 and over, on a real date', () => {
    expect(firstMessage({ ...MOTHER, dateOfBirth: isoYearsAgo(17) })).toBe(UNDERAGE);
    expect(firstMessage({ ...MOTHER, dateOfBirth: '2001-02-30' })).toBe(INVALID);
  });

  it('accepts only the terms version the app shows today', () => {
    expect(CURRENT_TERMS_VERSION).toBe('v1.0');
    expect(firstMessage({ ...MOTHER, termsAcceptedVersion: '1.0' })).toBe(
      'Please accept the latest terms to continue.',
    );
  });
});

describe('AgeRangeSchema', () => {
  it('is exactly the four bands the wizard and the console offer', () => {
    expect(AGE_RANGES).toEqual(['0-1', '1-3', '3-5', '5+']);
    expect(AgeRangeSchema.safeParse('2-5').success).toBe(false);
  });
});

describe('UpdateProfileRequestSchema', () => {
  it('drops a phone number instead of saving it — a number is changed only by verifying it', () => {
    expect(UpdateProfileRequestSchema.parse({ firstName: 'Mona', phone: '+201000000001' })).toEqual({
      firstName: 'Mona',
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm --filter @nanny-app/shared exec vitest run src/__tests__/registration-rules.test.ts`
Expected: FAIL, because `ageOn`, `AGE_RANGES` and the rest are not exported.

- [ ] **Step 3: Add the age bands.** In `packages/shared/src/nanny.ts`, directly after the `AvailabilityTypeSchema` declaration block:

```ts
/**
 * The age bands a nanny says she cares for — the chips the registration wizard
 * and the console's profile editor offer. Registration accepts only these, so
 * a typo can never become a band no filter knows about.
 */
export const AGE_RANGES = ['0-1', '1-3', '3-5', '5+'] as const;
export const AgeRangeSchema = z.enum(AGE_RANGES);
export type AgeRange = z.infer<typeof AgeRangeSchema>;
```

- [ ] **Step 4: Add the DOB helpers and the terms constant.** In `packages/shared/src/auth.ts`:
  1. Add `AgeRangeSchema` to the `./nanny` import.
  2. Insert this block immediately above the `/** Body for POST /auth/register` comment:

```ts
/** Nobody under this age may hold an account — mother or nanny. */
export const MIN_REGISTRATION_AGE = 18;
/** Past this, a birth date is a typo (a wrong century), not a person. */
export const MAX_REGISTRATION_AGE = 100;

const UNDERAGE_MESSAGE = `You must be at least ${MIN_REGISTRATION_AGE} to use NannyNow.`;
const INVALID_DOB_MESSAGE = 'Please enter a valid date of birth.';

/**
 * Whole years between an ISO `YYYY-MM-DD` birth date and `today`'s calendar
 * date, turning over on the birthday itself. Null for anything that is not a
 * real date — `2001-02-30` included, which `new Date` would quietly roll over.
 */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const todayMonth = today.getMonth() + 1;
  const hadBirthday = todayMonth > month || (todayMonth === month && today.getDate() >= day);
  return today.getFullYear() - year - (hadBirthday ? 0 : 1);
}

/**
 * The latest birth date that is MIN_REGISTRATION_AGE today — the date picker's
 * upper bound. On 29 February it is 28 February, since the target year has no
 * leap day and `new Date` would roll forward into March (one day too young).
 */
export function latestAllowedDob(today: Date = new Date()): Date {
  const latest = new Date(today.getFullYear() - MIN_REGISTRATION_AGE, today.getMonth(), today.getDate());
  if (latest.getMonth() !== today.getMonth()) latest.setDate(0);
  return latest;
}

/** What is wrong with a birth date, in the words both the app and the API show — or null. */
export function dateOfBirthError(dateOfBirth: string, today: Date = new Date()): string | null {
  const age = ageOn(dateOfBirth, today);
  if (age === null || age < 0 || age > MAX_REGISTRATION_AGE) return INVALID_DOB_MESSAGE;
  if (age < MIN_REGISTRATION_AGE) return UNDERAGE_MESSAGE;
  return null;
}

/** A birth date as registration accepts it: a real `YYYY-MM-DD`, 18 to 100 years ago. */
export const DateOfBirthSchema = z.string().superRefine((value, ctx) => {
  const message = dateOfBirthError(value);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

/**
 * The terms version the app shows today. Registration accepts only this, so
 * an account can't claim to have agreed to terms nobody showed it. Bump it
 * together with the app when the terms change.
 */
export const CURRENT_TERMS_VERSION = 'v1.0';
```

- [ ] **Step 5: Tighten `RegisterRequestSchema`.** In its object, replace these fields:

```ts
    dateOfBirth: DateOfBirthSchema,
    role: RoleSchema,
    termsAcceptedVersion: z.literal(CURRENT_TERMS_VERSION, {
      errorMap: () => ({ message: 'Please accept the latest terms to continue.' }),
    }),
    // Required for both roles: the address book's first row is built from it,
    // and a pin with no street line leaves a nanny unable to find the door.
    address: z
      .string({ required_error: 'Please enter your street address.' })
      .trim()
      .min(1, 'Please enter your street address.')
      .max(200),
```

and further down:

```ts
    // The step-1 photo, uploaded at the end of the wizard — required for both
    // roles: a nanny's is on her public profile, a mother's is what the nanny
    // sees on a booking request.
    avatarUrl: z.string({ required_error: 'Please add a profile photo.' }).url(),
    bio: z.string().trim().max(600).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    ageRanges: z.array(AgeRangeSchema).optional(),
```

Then:
- Update the comment above the nanny profile fields so it no longer lists the photo as nanny-only.
- Delete the `.refine((v) => v.role !== 'NANNY' || !!v.address, …)` block.
- In the photo/bio refine, drop `!!v.avatarUrl &&` and change its message to `'Nannies must provide a bio, years of experience, and availability.'`. Grep `packages apps` for the old message `'Nannies must provide a photo, bio'`, and update any test that asserts it.

- [ ] **Step 6: Take phone off PATCH.** In `UpdateProfileRequestSchema`, delete the `phone` field. Add this comment where it was:

```ts
  // No phone: a number is proven by SMS, and PATCH can't prove anything.
  // Changing it becomes its own verified flow later.
```

- [ ] **Step 7: Update the existing shared test.** In `packages/shared/src/__tests__/register-nanny-required.test.ts`:
  - Set `termsAcceptedVersion: 'v1.0'`.
  - Change the last case so a mother still brings her photo and address:

```ts
  it('asks none of the nanny profile of a mother', () => {
    const { idDocumentType, idDocumentFrontUrl, bio, yearsOfExperience, ageRanges, availabilityType, schedule, ...mother } = NANNY;
    expect(firstMessage({ ...mother, role: 'MOTHER' })).toBeNull();
  });
```

- [ ] **Step 8: Run the shared suite.**

Run: `pnpm --filter @nanny-app/shared test`
Expected: PASS (every file).

- [ ] **Step 9: Add the backend test helpers.** Create `apps/backend/test/storage-url.ts`:

```ts
/**
 * A Firebase Storage download URL for an object this user uploaded, in the
 * shape `uploadImageToFirebase` produces (`<folder>/<uid>/<file>`, URL-encoded
 * after `/o/`). The backend accepts no other shape for a photo or ID image, so
 * every fixture that registers, patches an avatar or submits an ID uses this.
 */
export function storageUrl(folder: 'avatars' | 'nanny-ids', uid: string, file = 'photo.jpg'): string {
  const objectPath = encodeURIComponent(`${folder}/${uid}/${file}`);
  return `https://firebasestorage.googleapis.com/v0/b/demo-nannyapp.appspot.com/o/${objectPath}?alt=media&token=test`;
}
```

Append to `apps/backend/test/auth.ts`:

```ts
/**
 * The Firebase uid inside an ID token. The emulator's tokens are unsigned
 * JWTs, so the payload reads directly — used where a helper hands back only a
 * token but a fixture needs the uid (an upload path, say).
 */
export function uidOf(idToken: string): string {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('Not a JWT');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    user_id?: string;
    sub?: string;
  };
  const uid = claims.user_id ?? claims.sub;
  if (!uid) throw new Error('ID token carries no uid');
  return uid;
}
```

- [ ] **Step 10: Adopt the contract in the backend service.** In `apps/backend/src/services/auth.service.ts`:
  1. In `registerUser`'s `tx.user.create` data, replace `avatarUrl: isNanny ? (body.avatarUrl ?? null) : null,` with:

```ts
        // Both roles bring a photo from step 1 — the mother's is what a nanny
        // sees on her booking request.
        avatarUrl: body.avatarUrl,
```

  2. In `createAddress(...)`, `formattedAddress: body.address ?? ''` becomes `formattedAddress: body.address`.
  3. In `updateProfile`, delete the whole `if (body.phone) { … }` block and the `...(body.phone !== undefined && { phone: body.phone }),` line.
  4. In `apps/backend/src/routes/auth.routes.ts`, change the PATCH doc comment to `Updates profile fields for the current user (name, avatar URL). Phone is not patchable — it is proven by SMS.`

- [ ] **Step 11: Sweep the backend fixtures onto the contract.** Apply every item; `pnpm --filter @nanny-app/backend typecheck` and the suites find anything missed.
  - **Every `/auth/register` body and `RegisterRequest` constant:**
    - `termsAcceptedVersion: '1.0'` becomes `'v1.0'`. Typed constants may import `CURRENT_TERMS_VERSION`.
    - `ageRanges: ['0-1', '2-5']` becomes `['0-1', '1-3']`.
    - Every mother body gains `avatarUrl`.
  - **URLs:**
    - Every `avatarUrl`, `idDocumentFrontUrl` and `idDocumentBackUrl` in these files becomes `storageUrl('avatars' | 'nanny-ids', <that account's uid>, '<file>.jpg')`.
    - Unit tests use uid `'fb-1'` and import from `'../../test/storage-url'`.
    - Integration tests import from `'../../../test/storage-url'`. They take the uid from `createEmulatorUser(...)`'s return value, from `mother.firebaseUid` for factory users, or from `uidOf(idToken)` after `signInWithGoogleAs`.
    - Replace the `ID_FRONT` / `ID_BACK` / `AVATAR` module constants with per-account calls.
  - **Unit test files:**
    - `auth-register-address.test.ts`: `MOTHER_BODY` gains `avatarUrl: storageUrl('avatars', 'fb-1')`.
    - `auth-register-nanny-profile.test.ts`:
      - Update the URLs and `MOTHER_BODY`.
      - The mother case asserting `userData.avatarUrl` / `res.avatarUrl` `toBeNull()` now asserts `toBe(MOTHER_BODY.avatarUrl)`, and its test name says the mother's photo is saved.
    - `auth-service-id.test.ts`: `NANNY_BODY`, `MOTHER_BODY`, and the `submitId` URL.
    - `auth-firebase-email.test.ts` (bodies near lines 324 and 355) and `auth-availability.test.ts` (near line 53): terms and a mother `avatarUrl`.
  - **Integration files:**
    - `a10-nanny-onboarding.test.ts`: capture `const uid = await createEmulatorUser(...)`, then set the URLs, terms and age ranges.
    - `a11-mother-id-gate.test.ts`: terms, a mother `avatarUrl`, and ID URLs for the `/auth/id` call with the registering account's uid.
    - `a14-mother-email-gate.test.ts`: terms, and a mother `avatarUrl` using the uid `createEmulatorUser` returns.
    - `a20-profiles.test.ts`: both `'https://storage.example.test/nadia.jpg'` become `storageUrl('avatars', mother.firebaseUid, 'nadia.jpg')`. Compute it once as a `const`.
    - `a24-social-registration.test.ts`: `registrationBody(email, phone)` gains a `uid` parameter for the mother `avatarUrl`. Nanny URLs use the same uid, and every call site passes `uidOf(idToken)`.
  - **Seeders:** `test/factories/user.ts:167` and `test/e2e/seed-mobile.ts:170` become `ageRanges: ['0-1', '1-3']`.

- [ ] **Step 12: Fix the admin E2E helpers.** In `apps/admin/e2e/helpers/backend.ts`:
  - **Bodies:** `termsAcceptedVersion` becomes `'v1.0'`; `ageRanges` becomes `['0-1', '1-3']`; `seedMother` gains an `avatarUrl`.
  - **URLs:** the module constants `ID_FRONT` and `AVATAR` become per-account `storageUrl(...)` calls. `LISTING_PHOTO` is not a registration URL; leave it.
  - **Pre-existing breakage:** these helpers still register accounts that have no verified phone. `/auth/register` has refused that since `da6b851`, so this also fixes that.
  - Add near the auth helpers:

```ts
const PROJECT_ID = process.env['FIREBASE_PROJECT_ID'] ?? 'demo-nannyapp';

/** The uid inside an emulator ID token (an unsigned JWT). */
function uidOf(idToken: string): string {
  const payload = idToken.split('.')[1];
  const claims = payload
    ? (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id?: string })
    : {};
  if (!claims.user_id) throw new Error('ID token carries no uid');
  return claims.user_id;
}

/** A download URL in the only shape /auth/register accepts: this user's own upload folder. */
function storageUrl(folder: 'avatars' | 'nanny-ids', uid: string, file: string): string {
  const objectPath = encodeURIComponent(`${folder}/${uid}/${file}`);
  return `https://firebasestorage.googleapis.com/v0/b/${PROJECT_ID}.appspot.com/o/${objectPath}?alt=media&token=e2e`;
}

/**
 * Puts a verified phone on the account, as both app wizards do before
 * /auth/register (which refuses a number the token's `phone_number` claim does
 * not carry), and returns a fresh ID token carrying it. `Bearer owner` is the
 * emulator's admin credential; this is the endpoint the Admin SDK uses.
 */
async function linkPhone(email: string, idToken: string, phoneNumber: string): Promise<string> {
  const response = await fetch(`${IDENTITY_TOOLKIT}/projects/${PROJECT_ID}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uidOf(idToken), phoneNumber }),
  });
  if (!response.ok) {
    throw new Error(`Emulator phone link failed for ${email}: ${response.status} ${await response.text()}`);
  }
  return signIn(email);
}
```

  In each of `seedMother`, `seedPendingNanny` and `seedApprovedNanny`:
  1. Compute `const phone = uniquePhone();`.
  2. Replace `const token = await signUp(email);` with:

```ts
  const token = await linkPhone(email, await signUp(email), phone);
  const uid = uidOf(token);
```

  3. Pass `phone` in the body.
  4. Use `storageUrl('avatars', uid, 'e2e-avatar.jpg')` and `storageUrl('nanny-ids', uid, 'e2e-id-front.jpg')`. In `seedMother`, use the latter for the `/auth/id` call too.

  Verification: this suite runs in the plan's final verification against the lab stack. Here, run `pnpm --filter @nanny-app/admin typecheck`.

- [ ] **Step 13: Adopt the contract on mobile.**
  - **`registrationDraftStore.ts`:** import `type AgeRange` from `@nanny-app/shared` and type `ageRanges: AgeRange[]`. If `RegistrationNannyDetailsScreen.tsx`'s toggle then fails to typecheck, type its local `AGE_RANGE_OPTIONS` as `readonly AgeRange[]`; Task 4 replaces it with the shared list.
  - **`AccountDetailsScreen.tsx`:** phone becomes read-only, like email.
    - Delete the `phone` state, its `setPhone` calls, and the `trimmedPhone` / `phoneUpdate` block and its spread in the mutation.
    - Render the phone as a read-only field:

```tsx
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone</Text>
            {/* Read-only: a number is changed only by verifying the new one by SMS. */}
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={profile?.phone ?? ''}
              editable={false}
              keyboardType="phone-pad"
            />
          </View>
```

  - **`RegistrationStep3Screen.tsx`:** photo upload for both roles.
    1. Delete the local `TERMS_VERSION` constant and its comment. Import `CURRENT_TERMS_VERSION` from `@nanny-app/shared`, and send `termsAcceptedVersion: CURRENT_TERMS_VERSION`.
    2. Rename `isUploadingId` / `setIsUploadingId` to `isUploadingPhotos` / `setIsUploadingPhotos`. The button label `'Uploading ID…'` becomes `'Uploading photos…'`. Grep `apps/mobile/e2e` for `Uploading ID` and update any match.
    3. Add a module constant below `INSTANT_VERIFICATION_SPENT_MESSAGE`:

```ts
const PHOTO_UPLOAD_FAILED_MESSAGE =
  "Couldn't upload your photos. Check your connection and try again.";
```

    4. Replace the whole "2. Nannies must supply their ID…" block, from its comment through the closing `}` of `if (apiRole === 'NANNY')`, with:

```ts
    // 2. Upload the photos, now that the account is signed in
    // (uploadImageToFirebase files them under the uid) and before the profile
    // is saved, so the URLs go out with the register request. Every account
    // brings the step-1 photo; a nanny also brings her ID (both sides for a
    // national ID, front only for a passport).
    let idDocumentFrontUrl: string | undefined;
    let idDocumentBackUrl: string | undefined;
    const idDocumentType = draft.idDocumentType ?? undefined;
    const needsBack = draft.idDocumentType != null && idTypeRequiresBack(draft.idDocumentType);
    if (apiRole === 'NANNY' && (!draft.idDocumentType || !draft.idFrontUri || (needsBack && !draft.idBackUri))) {
      setFormError('Your ID is missing. Please go back and upload it.');
      return;
    }
    if (!draft.photoUri) {
      setFormError('Your profile photo is missing. Please go back and add it.');
      return;
    }
    let avatarUrl: string;
    try {
      setIsUploadingPhotos(true);
      if (apiRole === 'NANNY' && draft.idFrontUri) {
        idDocumentFrontUrl = await uploadImageToFirebase(draft.idFrontUri, 'nanny-ids');
        if (needsBack && draft.idBackUri) {
          idDocumentBackUrl = await uploadImageToFirebase(draft.idBackUri, 'nanny-ids');
        }
      }
      avatarUrl = await uploadImageToFirebase(draft.photoUri, 'avatars');
    } catch {
      setFormError(PHOTO_UPLOAD_FAILED_MESSAGE);
      return;
    } finally {
      setIsUploadingPhotos(false);
    }
```

    5. In the `registerProfile.mutateAsync({...})` body:
       - Send `address: draft.address` (no `|| undefined`).
       - Add `avatarUrl,` right after `idDocumentBackUrl,`.
       - Remove `avatarUrl,` from the `...(apiRole === 'NANNY' && { … })` spread.

- [ ] **Step 14: Update the Step 3 tests.** In `apps/mobile/src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx`:
  1. Replace the storage mock with an observable one:

```tsx
const mockUpload = jest.fn();
jest.mock('@mobile/lib/storage', () => ({
  uploadImageToFirebase: (...args: unknown[]) => mockUpload(...args),
}));
```

  2. Add `photoUri: 'file:///photo.jpg',` and `address: '1 Test Street, Cairo',` to `seedMotherDraft`'s defaults.
  3. In `beforeEach`, add `mockUpload.mockImplementation(async (_uri: string, folder: string) => \`https://storage.test/${folder}/uid/photo.jpg\`);`.
  4. Append:

```tsx
it('uploads a mother’s photo and registers it, with the current terms version', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  renderScreen();

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledWith('file:///photo.jpg', 'avatars');
  expect(mockRegister.mock.calls[0][0]).toMatchObject({
    avatarUrl: 'https://storage.test/avatars/uid/photo.jpg',
    address: '1 Test Street, Cairo',
    termsAcceptedVersion: 'v1.0',
  });
});

it('says the photos failed to upload, and registers nothing, when an upload throws', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  mockUpload.mockRejectedValueOnce(new Error('storage/retry-limit-exceeded'));
  renderScreen();

  completeSetup();

  await waitFor(() =>
    expect(
      screen.getByText("Couldn't upload your photos. Check your connection and try again."),
    ).toBeTruthy(),
  );
  expect(mockRegister).not.toHaveBeenCalled();
});
```

- [ ] **Step 15: Run everything this task touched.**

Run each and expect it to pass:
- `pnpm --filter @nanny-app/shared test`
- `pnpm --filter @nanny-app/backend typecheck`
- `pnpm --filter @nanny-app/backend test:unit`
- `pnpm --filter @nanny-app/admin typecheck`
- `cd apps/mobile && pnpm exec tsc --noEmit && pnpm exec jest src/screens/auth`
- With the stack up (`pnpm test:env`): `pnpm --filter @nanny-app/backend test:integration`

Also run: `pnpm --filter @nanny-app/backend exec jest --selectProjects integration --maxWorkers=1 a10 a11 a14 a20 a24`. If the stack is not up, say so in your report rather than skipping silently; the controller runs it.

- [ ] **Step 16: Commit.**

```bash
git add packages/shared/src/nanny.ts packages/shared/src/auth.ts packages/shared/src/__tests__/registration-rules.test.ts packages/shared/src/__tests__/register-nanny-required.test.ts apps/backend/src/services/auth.service.ts apps/backend/src/routes/auth.routes.ts apps/backend/test/storage-url.ts apps/backend/test/auth.ts <every backend fixture file you changed> apps/admin/e2e/helpers/backend.ts apps/mobile/src/store/registrationDraftStore.ts apps/mobile/src/screens/parent/AccountDetailsScreen.tsx apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx
git commit -m "feat(auth): one registration contract — adults only, current terms, photo and address from everyone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Upload URLs must be the caller's own

**Files:**
- Create: `apps/backend/src/lib/storage-url.ts`
- Create: `apps/backend/src/__tests__/storage-url.test.ts`
- Modify: `apps/backend/src/services/auth.service.ts` (`registerUser`, `updateProfile`, `submitId`)
- Modify: the five auth-service unit test files from Task 1 (add a config mock)
- Modify: `apps/backend/src/__integration__/journeys/a20-profiles.test.ts` (a refusal case)

**Interfaces:**
- Consumes: `storageUrl` from `apps/backend/test/storage-url.ts` and `uidOf` (Task 1).
- Produces:
  - `isOwnStorageUrl(url: string, rules: OwnStorageUrlRules): boolean`
  - `assertOwnStorageUrl(url: string, uid: string, folder: StorageFolder): void`, which throws a 400 `Upload the photo again.`
  - `type StorageFolder = 'avatars' | 'nanny-ids'`

**Why the emulator is special:** the E2E build is a real build pointed at the Storage emulator. Its download URLs come from `10.0.2.2:9199` and name the app's real bucket (`nanny-now-d8518.firebasestorage.app`), while the backend's test config says `demo-nannyapp.appspot.com`. So under a `demo-` project, which can never reach production, only the object path is checked. In every other environment the host (`firebasestorage.googleapis.com` over https) and the bucket must match too.

- [ ] **Step 1: Write the failing tests.** Create `apps/backend/src/__tests__/storage-url.test.ts`:

```ts
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));

import { assertOwnStorageUrl, isOwnStorageUrl } from '@backend/lib/storage-url';

const LIVE = { uid: 'uid-1', folder: 'avatars', bucket: 'nanny-now-d8518.firebasestorage.app', emulator: false };
const EMULATOR = { ...LIVE, emulator: true };

function liveUrl(objectPath: string, bucket = LIVE.bucket, host = 'firebasestorage.googleapis.com'): string {
  return `https://${host}/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=t`;
}

describe('isOwnStorageUrl — a real build', () => {
  it('accepts an object in this user’s own folder of our bucket', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/1720-abc.jpg'), LIVE)).toBe(true);
  });

  it('refuses another user’s folder', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-2/1720-abc.jpg'), LIVE)).toBe(false);
  });

  it('refuses the wrong folder', () => {
    expect(isOwnStorageUrl(liveUrl('nanny-ids/uid-1/1720-abc.jpg'), LIVE)).toBe(false);
  });

  it('refuses another bucket, another host, and plain http', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg', 'someone-else.appspot.com'), LIVE)).toBe(false);
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg', LIVE.bucket, 'evil.example'), LIVE)).toBe(false);
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/a.jpg').replace('https:', 'http:'), LIVE)).toBe(false);
  });

  it('refuses a path that climbs out of the folder, the folder itself, and non-URLs', () => {
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/../uid-2/a.jpg'), LIVE)).toBe(false);
    expect(isOwnStorageUrl(liveUrl('avatars/uid-1/'), LIVE)).toBe(false);
    expect(isOwnStorageUrl('not a url', LIVE)).toBe(false);
    expect(isOwnStorageUrl('https://firebasestorage.googleapis.com/somewhere-else', LIVE)).toBe(false);
  });
});

describe('isOwnStorageUrl — the emulator', () => {
  it('accepts the emulator’s own host and the app’s bucket name, still checking the path', () => {
    const url = `http://10.0.2.2:9199/v0/b/nanny-now-d8518.firebasestorage.app/o/${encodeURIComponent('avatars/uid-1/a.jpg')}?alt=media`;
    expect(isOwnStorageUrl(url, EMULATOR)).toBe(true);
    expect(isOwnStorageUrl(url.replace('uid-1', 'uid-2'), EMULATOR)).toBe(false);
  });
});

describe('assertOwnStorageUrl', () => {
  it('passes an own upload and refuses anything else with a 400 that says what to do', () => {
    const own = `https://firebasestorage.googleapis.com/v0/b/demo-nannyapp.appspot.com/o/${encodeURIComponent('nanny-ids/uid-1/f.jpg')}?alt=media`;
    expect(() => assertOwnStorageUrl(own, 'uid-1', 'nanny-ids')).not.toThrow();
    expect(() => assertOwnStorageUrl('https://storage.example.test/f.jpg', 'uid-1', 'nanny-ids')).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Upload the photo again.' }),
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm --filter @nanny-app/backend exec jest --selectProjects unit storage-url`
Expected: FAIL, because the module `@backend/lib/storage-url` is not found.

- [ ] **Step 3: Implement it.** Create `apps/backend/src/lib/storage-url.ts`:

```ts
import { config } from './config';
import { errors } from './errors';

/** Where every production Firebase Storage download URL is served from. */
const DOWNLOAD_HOST = 'firebasestorage.googleapis.com';

/** The upload folders a profile or KYC URL may point into. */
export type StorageFolder = 'avatars' | 'nanny-ids';

export type OwnStorageUrlRules = {
  uid: string;
  folder: string;
  bucket: string;
  /**
   * The Storage emulator serves uploads from its own host (10.0.2.2:9199 from
   * an Android emulator) under whatever bucket name the app is built with, so
   * only the object path can be checked there.
   */
  emulator: boolean;
};

/**
 * Whether `url` is a download URL for an object this user uploaded into
 * `folder` — `<folder>/<uid>/<file>` in our bucket, which is exactly where
 * `uploadImageToFirebase` puts it. Anything else would let a client pin its
 * profile or KYC record to someone else's upload, or to any image on the web.
 */
export function isOwnStorageUrl(url: string, rules: OwnStorageUrlRules): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!rules.emulator && (parsed.protocol !== 'https:' || parsed.host !== DOWNLOAD_HOST)) return false;

  // The object path stays percent-encoded in `pathname` (`avatars%2Fuid%2Ff.jpg`),
  // so it is one segment after `/o/`.
  const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(parsed.pathname);
  if (!match?.[1] || !match[2]) return false;
  if (!rules.emulator && match[1] !== rules.bucket) return false;

  let objectPath: string;
  try {
    objectPath = decodeURIComponent(match[2]);
  } catch {
    return false;
  }
  const prefix = `${rules.folder}/${rules.uid}/`;
  return (
    objectPath.startsWith(prefix) &&
    objectPath.length > prefix.length &&
    !objectPath.split('/').includes('..')
  );
}

/** Refuses, with a message the app can show as-is, any upload URL that isn't this user's own. */
export function assertOwnStorageUrl(url: string, uid: string, folder: StorageFolder): void {
  const own = isOwnStorageUrl(url, {
    uid,
    folder,
    bucket: config.firebase.storageBucket,
    // A `demo-` project id is emulator-only by Firebase's own rule, so this
    // can never loosen the check against the live bucket.
    emulator: config.firebase.projectId.startsWith('demo-'),
  });
  if (!own) throw errors.badRequest('Upload the photo again.');
}
```

- [ ] **Step 4: Run the tests.**

Run: `pnpm --filter @nanny-app/backend exec jest --selectProjects unit storage-url`
Expected: PASS.

- [ ] **Step 5: Use it in the service.** In `apps/backend/src/services/auth.service.ts`, import `assertOwnStorageUrl` from `@backend/lib/storage-url`, then:
  - **`registerUser`:** right after `assertFirebaseVerifiedPhone(decoded, body.phone);`, add:

```ts
  // Before anything is written: the photos must be this account's own uploads.
  assertOwnStorageUrl(body.avatarUrl, decoded.uid, 'avatars');
  if (body.idDocumentFrontUrl) assertOwnStorageUrl(body.idDocumentFrontUrl, decoded.uid, 'nanny-ids');
  if (body.idDocumentBackUrl) assertOwnStorageUrl(body.idDocumentBackUrl, decoded.uid, 'nanny-ids');
```

  - **`updateProfile`:** after the not-found check, add `if (body.avatarUrl) assertOwnStorageUrl(body.avatarUrl, decoded.uid, 'avatars');`. `null` still clears the photo.
  - **`submitId`:** after the not-found check, add:

```ts
  assertOwnStorageUrl(body.idDocumentFrontUrl, decoded.uid, 'nanny-ids');
  if (body.idDocumentBackUrl) assertOwnStorageUrl(body.idDocumentBackUrl, decoded.uid, 'nanny-ids');
```

- [ ] **Step 6: Keep the unit suites hermetic.** `auth.service` now imports `lib/config` through `lib/storage-url`. The unit project loads no env file, so without a mock the config would read `apps/backend/.env` (production) or fail to validate. Add this at the top of each of `auth-register-address.test.ts`, `auth-register-nanny-profile.test.ts`, `auth-service-id.test.ts`, `auth-firebase-email.test.ts` and `auth-availability.test.ts`, next to the other `jest.mock` calls:

```ts
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));
```

  If a file already mocks `@backend/lib/config`, merge these keys into that mock instead. Then add one refusal case to `auth-service-id.test.ts`'s `submitId` describe:

```ts
  it('refuses an ID image outside her own upload folder', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(/* the same existing-user row the other submitId cases use */);
    await expect(
      submitId(DECODED, { idDocumentType: 'PASSPORT', idDocumentFrontUrl: storageUrl('nanny-ids', 'someone-else', 'f.jpg') }),
    ).rejects.toThrow('Upload the photo again.');
  });
```

  Replace the comment with the row expression the neighbouring `submitId` test passes to `findUnique`.

- [ ] **Step 7: Add the integration refusal.** In `a20-profiles.test.ts`'s mother describe, add:

```ts
  it('refuses a photo that is not one of her own uploads', async () => {
    const mother = await makeMother();
    const response = await request(app)
      .patch('/auth/me')
      .set(...authHeader(mother.token))
      .send({ avatarUrl: 'https://storage.example.test/somebody.jpg' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Upload the photo again.');
  });
```

- [ ] **Step 8: Run the suites.**

Run each and expect it to pass:
- `pnpm --filter @nanny-app/backend typecheck`
- `pnpm --filter @nanny-app/backend test:unit`
- With the stack up: `pnpm --filter @nanny-app/backend test:integration`

- [ ] **Step 9: Commit.**

```bash
git add apps/backend/src/lib/storage-url.ts apps/backend/src/__tests__/storage-url.test.ts apps/backend/src/services/auth.service.ts apps/backend/src/__tests__/auth-register-address.test.ts apps/backend/src/__tests__/auth-register-nanny-profile.test.ts apps/backend/src/__tests__/auth-service-id.test.ts apps/backend/src/__tests__/auth-firebase-email.test.ts apps/backend/src/__tests__/auth-availability.test.ts apps/backend/src/__integration__/journeys/a20-profiles.test.ts
git commit -m "feat(auth): accept only the caller's own uploads as photo and ID URLs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fresh sessions, one account per race, and matching emails

**Files:**
- Modify: `apps/backend/src/middleware/auth.middleware.ts`
- Modify: `apps/backend/src/middleware/admin.middleware.ts` (doc comment only)
- Modify: `apps/backend/src/routes/auth.routes.ts` (`/register`)
- Modify: `apps/backend/src/routes/admin.routes.ts:193`
- Modify: `apps/backend/src/services/auth.service.ts` (`registerUser`)
- Create: `apps/backend/src/__tests__/fresh-auth.middleware.test.ts`
- Create: `apps/backend/src/__tests__/auth-register-hardening.test.ts`
- Create: `apps/backend/src/__integration__/journeys/a25-registration-hardening.test.ts`
- Modify: `apps/backend/src/__integration__/journeys/a14-mother-email-gate.test.ts`
- Modify: the Task 1 unit fixtures whose decoded token lacks `email` while the body brings a token

**Interfaces:**
- Consumes: `assertOwnStorageUrl` (Task 2); `storageUrl` and `uidOf` (Task 1).
- Produces: `requireFreshAuth`, an Express middleware with the same signature as `requireAuth`.

- [ ] **Step 1: Write the failing middleware test.** Create `apps/backend/src/__tests__/fresh-auth.middleware.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { verifyIdToken: jest.fn() },
}));

import { firebaseAuth } from '@backend/lib/firebase';
import { requireAuth, requireFreshAuth } from '@backend/middleware/auth.middleware';

const mockVerifyIdToken = firebaseAuth.verifyIdToken as jest.Mock;
const res = {} as Response;

function buildReq(): Request {
  return { headers: { authorization: 'Bearer tok' } } as Request;
}

function firebaseError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => jest.clearAllMocks());

describe('requireFreshAuth', () => {
  it('asks Firebase to check revocation, and attaches the token when the session is live', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'fb-1' });
    const req = buildReq();
    const next = jest.fn() as NextFunction;

    await requireFreshAuth(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok', true);
    expect(req.firebaseUser).toEqual({ uid: 'fb-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it.each(['auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'])(
    'tells a %s session it has ended',
    async (code) => {
      mockVerifyIdToken.mockRejectedValue(firebaseError(code));
      const next = jest.fn() as NextFunction;

      await requireFreshAuth(buildReq(), res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401, message: 'Your session has ended. Please sign in again.' }),
      );
    },
  );

  it('keeps the generic message for a token that is simply bad', async () => {
    mockVerifyIdToken.mockRejectedValue(firebaseError('auth/argument-error'));
    const next = jest.fn() as NextFunction;

    await requireFreshAuth(buildReq(), res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Invalid or expired token' }),
    );
  });
});

describe('requireAuth', () => {
  it('still skips the revocation round-trip', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'fb-1' });
    await requireAuth(buildReq(), res, jest.fn() as NextFunction);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok');
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `pnpm --filter @nanny-app/backend exec jest --selectProjects unit fresh-auth`
Expected: FAIL, because `requireFreshAuth` is not exported.

- [ ] **Step 3: Implement it.** In `apps/backend/src/middleware/auth.middleware.ts`, replace the `requireAuth` function with:

```ts
/** What the client is told when the session behind a genuine token is over. */
const SESSION_ENDED = 'Your session has ended. Please sign in again.';

/**
 * Firebase codes meaning the token was real but its session is not: signed
 * out everywhere (a password or email change revokes), disabled by support, or
 * the account deleted. Only a revocation-checking verify raises them.
 */
const SESSION_ENDED_CODES = new Set([
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);

function firebaseErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header against Firebase Admin
 * SDK and attaches the decoded token to `req.firebaseUser`. Throws 401 on
 * any failure — the global error handler maps it to a JSON response.
 *
 * `checkRevoked` costs a Firebase round-trip per request, so it is reserved
 * for the routes where a stale session must not act: creating an account, and
 * the admin console.
 */
function bearerAuth(checkRevoked: boolean) {
  return async function authenticate(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw errors.unauthorized('Missing or malformed Authorization header');
      }
      const token = header.slice('Bearer '.length).trim();
      if (!token) throw errors.unauthorized('Missing bearer token');

      req.firebaseUser = checkRevoked
        ? await firebaseAuth.verifyIdToken(token, true)
        : await firebaseAuth.verifyIdToken(token);
      next();
    } catch (err) {
      // verifyIdToken throws on expired/invalid/revoked tokens
      if (err instanceof Error && err.name !== 'AppError') {
        const code = firebaseErrorCode(err);
        next(
          errors.unauthorized(
            code && SESSION_ENDED_CODES.has(code) ? SESSION_ENDED : 'Invalid or expired token',
          ),
        );
        return;
      }
      next(err);
    }
  };
}

/** Any valid Firebase ID token. */
export const requireAuth = bearerAuth(false);

/** A valid Firebase ID token whose session has not been revoked or disabled since it was minted. */
export const requireFreshAuth = bearerAuth(true);
```

- [ ] **Step 4: Wire the routes.**
  - In `auth.routes.ts`, import `requireFreshAuth`. `/register` uses `requireFreshAuth` instead of `requireAuth`. Add a doc-comment line: `Fresh auth: a revoked or disabled session must not create an account.`
  - In `admin.routes.ts:193`, use `adminRouter.use(requireFreshAuth, requireAdmin, requireSectionAccess);` and fix the import.
  - In `admin.middleware.ts`, change "Requires `requireAuth` to have run first" to "Requires `requireFreshAuth` (or `requireAuth`) to have run first".

- [ ] **Step 5: Run the middleware tests.**

Run: `pnpm --filter @nanny-app/backend exec jest --selectProjects unit fresh-auth optional-auth admin-section-access`
Expected: PASS.

- [ ] **Step 6: Write the failing register tests.** Create `apps/backend/src/__tests__/auth-register-hardening.test.ts`:

```ts
/**
 * registerUser's defences against a request it must not trust as-is: an email
 * token for an address the account doesn't sign in with, two registrations
 * racing, and a retry that finds Firebase out of step with the row.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() }, $transaction: jest.fn() },
}));
jest.mock('@backend/lib/firebase', () => ({ firebaseAuth: { updateUser: jest.fn() } }));
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));
jest.mock('@backend/services/address.service', () => ({
  createAddress: jest.fn().mockResolvedValue({
    formattedAddress: '14 Garden Street, Maadi',
    latitude: 29.9602,
    longitude: 31.2569,
  }),
  getDefaultAddress: jest.fn().mockResolvedValue(null),
}));
jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/services/admin-nanny.service', () => ({
  reconcileNannySkills: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
  assertVerificationTokenIsValid: jest.fn(),
}));

import { CURRENT_TERMS_VERSION, Role, type RegisterRequest } from '@nanny-app/shared';
import { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { registerUser } from '@backend/services/auth.service';

import { storageUrl } from '../../test/storage-url';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const mockUpdateUser = firebaseAuth.updateUser as jest.Mock;

const EMAIL = 'layla@example.com';
const PHONE = '+201004455667';
const DECODED = { uid: 'fb-1', email: EMAIL, phone_number: PHONE } as never;

const BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: EMAIL,
  emailVerificationToken: 'b'.repeat(64),
  phone: PHONE,
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: CURRENT_TERMS_VERSION,
  address: '14 Garden Street, Maadi',
  latitude: 29.9602,
  longitude: 31.2569,
  avatarUrl: storageUrl('avatars', 'fb-1'),
};

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    firebaseUid: 'fb-1',
    email: EMAIL,
    phone: PHONE,
    firstName: 'Layla',
    lastName: 'Mostafa',
    dateOfBirth: null,
    avatarUrl: null,
    role: 'MOTHER',
    isEmailVerified: true,
    isPhoneVerified: true,
    approvalStatus: 'PENDING_ID',
    idDocumentType: null,
    rejectionReason: null,
    deletedAt: null,
    createdAt: new Date('2026-09-24T00:00:00.000Z'),
    ...overrides,
  };
}

function makeTx() {
  return {
    user: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve(userRow(data))),
    },
    nannyProfile: { create: jest.fn() },
  };
}

function uniqueClash(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

/** What a lookup by uid finds — flipped mid-test to model the other request committing. */
let rowForUid: ReturnType<typeof userRow> | null;

beforeEach(() => {
  jest.clearAllMocks();
  rowForUid = null;
  mockPrisma.user.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(where['firebaseUid'] ? rowForUid : null),
  );
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(makeTx()));
  mockUpdateUser.mockResolvedValue(undefined);
});

describe('registerUser — the email token must match the account', () => {
  it('refuses a token for an address the account does not sign in with', async () => {
    const other = { uid: 'fb-1', email: 'someone@else.com', phone_number: PHONE } as never;
    await expect(registerUser(other, BODY)).rejects.toThrow(
      "The email you verified doesn't match this account. Please start again.",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a token on an account with no email at all', async () => {
    const phoneOnly = { uid: 'fb-1', phone_number: PHONE } as never;
    await expect(registerUser(phoneOnly, BODY)).rejects.toThrow(
      "The email you verified doesn't match this account. Please start again.",
    );
  });

  it('matches regardless of capitalisation', async () => {
    const shouty = { uid: 'fb-1', email: 'Layla@Example.com', phone_number: PHONE } as never;
    await expect(registerUser(shouty, BODY)).resolves.toMatchObject({ id: 55 });
  });
});

describe('registerUser — the mother’s photo', () => {
  it('is saved on her row', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) => fn(tx));

    await registerUser(DECODED, BODY);

    expect(tx.user.create.mock.calls[0]?.[0].data.avatarUrl).toBe(BODY.avatarUrl);
  });
});

describe('registerUser — two requests racing', () => {
  it('returns the row the other request created when this one hit the unique uid', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      rowForUid = userRow();
      throw uniqueClash(['firebase_uid']);
    });
    await expect(registerUser(DECODED, BODY)).resolves.toMatchObject({ id: 55, firebaseUid: 'fb-1' });
  });

  it('returns that row even when this one failed on the token the other just spent', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      rowForUid = userRow();
      throw new Error('This code has already been used.');
    });
    await expect(registerUser(DECODED, BODY)).resolves.toMatchObject({ id: 55 });
  });

  it('answers 409 by the column when someone else took the phone in the gap', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(uniqueClash(['phone']));
    await expect(registerUser(DECODED, BODY)).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this phone number already exists.',
    });
  });

  it('answers 409 by the column when someone else took the email in the gap', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(uniqueClash(['email']));
    await expect(registerUser(DECODED, BODY)).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this email already exists.',
    });
  });

  it('rethrows any other failure when no row appeared', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('connection reset'));
    await expect(registerUser(DECODED, BODY)).rejects.toThrow('connection reset');
  });
});

describe('registerUser — a retry re-syncs Firebase', () => {
  it('marks the Firebase email verified again when Firebase lost it', async () => {
    rowForUid = userRow();
    const unverified = { uid: 'fb-1', email: EMAIL, email_verified: false, phone_number: PHONE } as never;

    await registerUser(unverified, BODY);

    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', { emailVerified: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves Firebase alone when it already agrees', async () => {
    rowForUid = userRow();
    const verified = { uid: 'fb-1', email: EMAIL, email_verified: true, phone_number: PHONE } as never;

    await registerUser(verified, BODY);

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not fail the retry when the re-sync itself fails', async () => {
    rowForUid = userRow();
    mockUpdateUser.mockRejectedValueOnce(new Error('firebase down'));
    const unverified = { uid: 'fb-1', email: EMAIL, email_verified: false, phone_number: PHONE } as never;

    await expect(registerUser(unverified, BODY)).resolves.toMatchObject({ id: 55 });
  });
});
```

- [ ] **Step 7: Run it to see it fail.**

Run: `pnpm --filter @nanny-app/backend exec jest --selectProjects unit auth-register-hardening`
Expected: FAIL. The mismatch, race and re-sync cases fail; the photo case passes because Task 1 already saves it.

- [ ] **Step 8: Implement the three defences.** In `apps/backend/src/services/auth.service.ts`:
  - Add `import { Prisma } from '@prisma/client';` alongside the existing type import.
  - Add `import type { AddressDto } from './address.service';` alongside the existing value import, or use whatever type `createAddress` actually returns.

  1. Below `assertFirebaseVerifiedEmail`, add:

```ts
/**
 * The address our OTP proved must be the one this Firebase account signs in
 * with. The phone wizard links an email/password credential for exactly that
 * address before registering; if they differ (a retried wizard that linked
 * another address, a client bug), the row would hold one email and Firebase
 * another, and email sign-in and password reset would reach the wrong inbox.
 */
function assertTokenEmailMatchesAccount(decoded: DecodedIdToken, email: string): void {
  const accountEmail = decoded.email?.trim().toLowerCase();
  if (!accountEmail || accountEmail !== email.trim().toLowerCase()) {
    throw errors.badRequest("The email you verified doesn't match this account. Please start again.");
  }
}

/**
 * Best-effort: keep Firebase's `emailVerified` in step with the row, whose
 * address we proved. The row is already committed when this runs, so a
 * Firebase hiccup must not turn a real registration into a 500;
 * `migrate-firebase-emails.ts` catches anything left out of step.
 */
async function markFirebaseEmailVerified(uid: string): Promise<void> {
  try {
    await firebaseAuth.updateUser(uid, { emailVerified: true });
  } catch (err) {
    console.warn('[auth] failed to mark the Firebase account email-verified', { uid, err });
  }
}

/**
 * A registration that failed inside its transaction may have lost a race
 * rather than failed: a double tap, or a retry that overlapped the first
 * request. If a row for this uid exists now, the other request made it —
 * answer with it, as the idempotent path would have. Otherwise a unique clash
 * means someone else took the email or phone since the lookup above.
 */
async function resolveFailedRegistration(
  decoded: DecodedIdToken,
  err: unknown,
): Promise<UserResponse> {
  const winner = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (winner && !winner.deletedAt) {
    return toUserResponse(winner, await flatLocationOf(winner.id));
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = JSON.stringify(err.meta?.['target'] ?? '');
    if (target.includes('phone')) {
      throw errors.conflict('An account with this phone number already exists.');
    }
    if (target.includes('email')) {
      throw errors.conflict('An account with this email already exists.');
    }
    throw errors.conflict('An account with these details already exists.');
  }
  throw err;
}
```

  2. In `registerUser`'s `if (existing)` branch, after the `deletedAt` check and before the `return`, add:

```ts
    // A retry after a lost response, or after the best-effort update at the
    // end failed: the row says proven, so Firebase should too.
    if (existing.isEmailVerified && decoded.email_verified !== true) {
      await markFirebaseEmailVerified(decoded.uid);
    }
```

  3. Move the email-proof block up to directly after the storage-URL checks, so a mismatched caller learns nothing from the collision lookup. Then make it:

```ts
  // Phone sign-ups prove their address mid-wizard and arrive holding the token
  // for it — which must be for the address this account signs in with. Google
  // and Apple sign-ups arrive without one, because Firebase has already
  // verified the provider's address — so check that instead. Either way, no
  // account is created with an unproven address.
  const emailVerificationToken = body.emailVerificationToken;
  if (emailVerificationToken) {
    assertTokenEmailMatchesAccount(decoded, body.email);
  } else {
    assertFirebaseVerifiedEmail(decoded, body.email);
  }
```

  4. Wrap the transaction. Change `const created = await prisma.$transaction(async (tx) => { … });` to:

```ts
  let created: { user: User; home: AddressDto };
  try {
    created = await prisma.$transaction(async (tx) => {
      // …unchanged body…
    });
  } catch (err) {
    return resolveFailedRegistration(decoded, err);
  }
```

  5. Replace the trailing `try { await firebaseAuth.updateUser(decoded.uid, { emailVerified: true }); } catch …` block, and its long comment, with a one-line comment and `await markFirebaseEmailVerified(decoded.uid);`.

- [ ] **Step 9: Give the token-carrying unit fixtures an email.** The new check refuses a body with `emailVerificationToken` when the decoded token lacks the same `email`.
  - Wherever a Task 1 unit fixture's decoded token (`DECODED`, `DECODED_MOTHER`, `DECODED_UNVERIFIED`, `DECODED_MOTHER_UNVERIFIED`, the inline `{ uid: 'fb-1' }` near `auth-register-nanny-profile.test.ts:383`, and so on) is used with a body carrying `emailVerificationToken`, add `email: '<that body's email>'`.
  - Leave the social-path decoded tokens (no body token) as they are.

- [ ] **Step 10: Run the unit suite.**

Run: `pnpm --filter @nanny-app/backend typecheck && pnpm --filter @nanny-app/backend test:unit`
Expected: PASS.

- [ ] **Step 11: Bring A14 in line with the app.** The app now links the verified address itself as the Firebase password credential, so A14's `registerMother` must sign in on that address rather than on a phone placeholder.
  - In `a14-mother-email-gate.test.ts`, `registerMother` creates the emulator user on `email`, with `createEmulatorUser(email, undefined, phone)` and `signInAs(email)`.
  - It no longer returns `placeholder`. The first case drops its `not.toBe(placeholder)` assertion, and its name becomes `'creates the account with the proven address'`.
  - Leave `placeholderEmail` in place if `makeLegacyMother` still uses it.
  - Add this case to that describe:

```ts
  it('refuses a token when the account signs in with a different address', async () => {
    const phone = uniquePhone();
    const placeholder = placeholderEmail(phone);
    const uid = await createEmulatorUser(placeholder, undefined, phone);
    const idToken = await signInAs(placeholder);
    const email = uniqueEmail();

    const response = await request(app)
      .post('/auth/register')
      .set(...authHeader(idToken))
      .send({
        firstName: 'Gate',
        lastName: 'Tester',
        email,
        emailVerificationToken: await proveEmail(email),
        phone,
        dateOfBirth: '1992-04-01',
        role: 'MOTHER',
        termsAcceptedVersion: 'v1.0',
        latitude: 30.0444,
        longitude: 31.2357,
        address: '1 Test Street, Cairo',
        avatarUrl: storageUrl('avatars', uid),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("The email you verified doesn't match this account. Please start again.");
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });
```

- [ ] **Step 12: Add A25.** Create `apps/backend/src/__integration__/journeys/a25-registration-hardening.test.ts`:

```ts
/**
 * A25 — registration refuses what it cannot trust, and answers a double tap
 * with one account. Each case runs the real route against the Auth emulator,
 * so revocation, uid-scoped upload paths and the unique indexes are the real
 * ones, not stand-ins.
 */
import request from 'supertest';

import { CURRENT_TERMS_VERSION } from '@nanny-app/shared';

import { app } from '@backend/app';
import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';

import { authHeader, createEmulatorUser, signInAs } from '../../../test/auth';
import { proveEmail } from '../../../test/journeys/email-verification';
import { storageUrl } from '../../../test/storage-url';

function uniquePhone(): string {
  return `+2016${String(Date.now()).slice(-8)}`;
}

function uniqueEmail(): string {
  return `a25-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

/** A mother mid-wizard: phone linked, address proven, about to call /auth/register. */
async function motherAboutToRegister() {
  const email = uniqueEmail();
  const phone = uniquePhone();
  const uid = await createEmulatorUser(email, undefined, phone);
  const token = await signInAs(email);
  const body = {
    firstName: 'Hard',
    lastName: 'Ened',
    email,
    emailVerificationToken: await proveEmail(email),
    phone,
    dateOfBirth: '1992-04-01',
    role: 'MOTHER',
    termsAcceptedVersion: CURRENT_TERMS_VERSION,
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
    avatarUrl: storageUrl('avatars', uid),
  };
  return { uid, token, body, phone };
}

function register(token: string, body: Record<string, unknown>) {
  return request(app).post('/auth/register').set(...authHeader(token)).send(body);
}

describe('A25 — registration refuses what it cannot trust', () => {
  it('refuses a revoked session, saying the session has ended', async () => {
    const { uid, token, body, phone } = await motherAboutToRegister();
    // Revocation is recorded to the second; a token minted in that same second
    // would still count as fresh.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await firebaseAuth.revokeRefreshTokens(uid);

    const response = await register(token, body);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Your session has ended. Please sign in again.');
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses a photo from someone else’s upload folder', async () => {
    const { token, body, phone } = await motherAboutToRegister();

    const response = await register(token, { ...body, avatarUrl: storageUrl('avatars', 'someone-else') });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Upload the photo again.');
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('refuses someone under 18', async () => {
    const { token, body, phone } = await motherAboutToRegister();
    const seventeen = `${new Date().getFullYear() - 17}-01-01`;

    const response = await register(token, { ...body, dateOfBirth: seventeen });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('You must be at least 18 to use NannyNow.');
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
  });

  it('answers two simultaneous registrations with the same single account', async () => {
    const { token, body, phone } = await motherAboutToRegister();

    const [first, second] = await Promise.all([register(token, body), register(token, body)]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.data.id).toBe(second.body.data.id);
    expect(await prisma.user.count({ where: { phone } })).toBe(1);
  });
});
```

- [ ] **Step 13: Run the integration suite.**

Run: `pnpm --filter @nanny-app/backend test:integration` with the stack up. Admin journeys now go through `requireFreshAuth`, so the whole suite is the proof that nothing else broke.
Expected: PASS, including a14, a25 and every admin-token journey. If the stack is not up, report it; the controller runs it.

- [ ] **Step 14: Commit.**

```bash
git add apps/backend/src/middleware/auth.middleware.ts apps/backend/src/middleware/admin.middleware.ts apps/backend/src/routes/auth.routes.ts apps/backend/src/routes/admin.routes.ts apps/backend/src/services/auth.service.ts apps/backend/src/__tests__/fresh-auth.middleware.test.ts apps/backend/src/__tests__/auth-register-hardening.test.ts apps/backend/src/__integration__/journeys/a25-registration-hardening.test.ts apps/backend/src/__integration__/journeys/a14-mother-email-gate.test.ts <every unit fixture file you changed in Step 9>
git commit -m "feat(auth): fresh sessions for register and admin, one account per race, matching emails

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The wizard enforces the same rules on screen

**Files:**
- Modify: `apps/mobile/src/lib/validation.ts` (+ `src/lib/__tests__/validation.test.ts`)
- Modify: `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx` (+ its test)
- Modify: `apps/mobile/src/screens/auth/RegistrationStep2Screen.tsx`
- Create: `apps/mobile/src/screens/auth/__tests__/RegistrationStep2Screen.test.tsx`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx` (use the shared `dobToIso`)
- Modify: `apps/mobile/src/screens/auth/RegistrationNannyDetailsScreen.tsx` (`AGE_RANGES`)
- Modify: `apps/admin/src/features/nannies/nanny-profile-editor.tsx` (`AGE_RANGES`)
- Modify: `apps/mobile/src/hooks/useAuth.ts` (`useConfirmPhoneAndLink` refreshes the token) and `src/hooks/__tests__/useAuth.confirmPhoneAndLink.test.tsx`
- Modify: `apps/mobile/e2e/flows/c02-mother-registration.yaml`, `apps/mobile/e2e/flows/c11-google-sign-up.yaml`
- Modify: `packages/shared/src/qa-scenarios.ts`

**Interfaces:**
- Consumes: `latestAllowedDob`, `dateOfBirthError` and `AGE_RANGES` from `@nanny-app/shared` (Task 1).
- Produces: `dobToIso(dob: string): string` and `validateDob(dob: string, today?: Date): string | null` in `@mobile/lib/validation`.

- [ ] **Step 1: Write the failing validation tests.** Append to `apps/mobile/src/lib/__tests__/validation.test.ts`, importing `dobToIso` and `validateDob` alongside what the file already imports from `@mobile/lib/validation`:

```ts
describe('dobToIso', () => {
  it('turns the picker’s mm/dd/yyyy into YYYY-MM-DD', () => {
    expect(dobToIso('05/10/1990')).toBe('1990-05-10');
  });

  it('returns an empty string for anything else', () => {
    expect(dobToIso('1990-05-10')).toBe('');
    expect(dobToIso('')).toBe('');
  });
});

describe('validateDob', () => {
  const today = new Date(2026, 8, 24);

  it('asks for a date when none was picked', () => {
    expect(validateDob('', today)).toBe('Please select your date of birth.');
  });

  it('accepts someone who turns 18 today', () => {
    expect(validateDob('09/24/2008', today)).toBeNull();
  });

  it('refuses someone who turns 18 tomorrow, in the API’s own words', () => {
    expect(validateDob('09/25/2008', today)).toBe('You must be at least 18 to use NannyNow.');
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

Run: `cd apps/mobile && pnpm exec jest src/lib/__tests__/validation.test.ts`
Expected: FAIL, because `dobToIso` and `validateDob` are not exported.

- [ ] **Step 3: Implement them.** In `apps/mobile/src/lib/validation.ts`, add `import { dateOfBirthError } from '@nanny-app/shared';` at the top, and append:

```ts
/** The date picker's 'mm/dd/yyyy' as the API's 'YYYY-MM-DD'. Empty string on bad input. */
export function dobToIso(dob: string): string {
  const m = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Step 1's birth-date check — the shared rule the API enforces (18 to 100, a
 * real date), so the wizard refuses on the screen where the date can still be
 * changed, not three steps later.
 */
export function validateDob(dob: string, today: Date = new Date()): string | null {
  if (!dob) return 'Please select your date of birth.';
  return dateOfBirthError(dobToIso(dob), today);
}
```

  In `RegistrationStep3Screen.tsx`, delete the local `dobToIso` function and its comment, and import `dobToIso` from `@mobile/lib/validation`; that import line already brings in `toE164`.

- [ ] **Step 4: Run the tests.**

Run: `cd apps/mobile && pnpm exec jest src/lib/__tests__/validation.test.ts src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing Step 1 test.** Append to `RegistrationStep1Screen.test.tsx`:

```tsx
describe('RegistrationStep1Screen — date of birth', () => {
  it('refuses someone under 18 before asking the API anything', async () => {
    const now = new Date();
    const seventeen = `01/01/${now.getFullYear() - 17}`;
    useRegistrationDraftStore.setState({ dob: seventeen });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText('You must be at least 18 to use NannyNow.')).toBeTruthy());
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it to see it fail.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`
Expected: FAIL. The availability call goes out and no age message appears.

- [ ] **Step 7: Enforce it in Step 1.** In `RegistrationStep1Screen.tsx`:
  1. Import `latestAllowedDob` from `@nanny-app/shared` and `validateDob` from `@mobile/lib/validation` (extend the existing import).
  2. Delete the module constant `MAX_DOB`. Inside the component, next to the other state, add:

```tsx
  // The picker offers no date that would make them under 18 — the same rule
  // the API holds registration to. Computed per render so a screen left open
  // past midnight doesn't keep yesterday's bound.
  const maxDob = latestAllowedDob();
```

  3. Replace both `maximumDate={MAX_DOB}` with `maximumDate={maxDob}`.
  4. Replace the `if (!/^\d{2}\/\d{2}\/\d{4}$/.test(draft.dob)) { … }` block in `handleContinue` with:

```tsx
    const dobError = validateDob(draft.dob);
    if (dobError) {
      setFormError(dobError);
      return;
    }
```

- [ ] **Step 8: Run the Step 1 tests.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`
Expected: PASS. The existing fixture DOB `05/10/1998` is over 18.

- [ ] **Step 9: Write the failing Step 2 test.** Create `apps/mobile/src/screens/auth/__tests__/RegistrationStep2Screen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ role: 'parent' }),
}));
// The map and the places search are native/network surfaces; Continue's guard
// only reads the draft.
jest.mock('@mobile/components/HomeLocationMapCard', () => () => null);
jest.mock('@mobile/components/LocationSearchInput', () => () => null);
jest.mock('@mobile/lib/googlePlaces', () => ({ reverseGeocode: jest.fn().mockResolvedValue(null) }));

import RegistrationStep2Screen from '@mobile/screens/auth/RegistrationStep2Screen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ role: 'parent', latitude: 30.04, longitude: 31.23 });
});

it('asks for a street address when the pin is set but the line is empty', () => {
  useRegistrationDraftStore.setState({ address: '   ' });
  render(<RegistrationStep2Screen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(screen.getByText('Please enter your street address.')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

it('moves on with a pin and a street address', () => {
  useRegistrationDraftStore.setState({ address: '1 Test Street, Cairo' });
  render(<RegistrationStep2Screen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-3', params: { role: 'parent' } });
});
```

  If the mocked `LocationSearchInput` / `HomeLocationMapCard` are default exports that the screen imports differently (named plus default), shape the mock factory to match: `() => ({ __esModule: true, default: () => null })`.

- [ ] **Step 10: Run it to see it fail.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/RegistrationStep2Screen.test.tsx`
Expected: the first case FAILS because it navigates; the second passes.

- [ ] **Step 11: Enforce it in Step 2.** In `RegistrationStep2Screen.tsx`'s `handleContinue`, after the pin check:

```tsx
    // The street line is required for every account — it becomes the first
    // address-book entry, and a pin alone doesn't tell a nanny which door.
    if (!draft.address.trim()) {
      setLocationError('Please enter your street address.');
      return;
    }
```

  Confirm that `locationError` renders somewhere visible on the screen; it already shows the pin error. If it renders only inside the map card, render it under the address input too.

- [ ] **Step 12: Run the Step 2 tests.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/RegistrationStep2Screen.test.tsx`
Expected: PASS.

- [ ] **Step 13: One list of age bands.**
  - **`RegistrationNannyDetailsScreen.tsx`:** delete `const AGE_RANGE_OPTIONS = [...]`, import `AGE_RANGES` from `@nanny-app/shared`, and map over `AGE_RANGES`.
  - **`apps/admin/src/features/nannies/nanny-profile-editor.tsx`:**
    - Delete the local `AGE_RANGE_OPTIONS` and its "mirrors …" comment.
    - Import `AGE_RANGES` from `@nanny-app/shared` and map over it.
    - The editor's `Set<string>` state stays as it is. A legacy band already on a profile is kept and sent back untouched; the admin schema still accepts any string.

- [ ] **Step 14: Make the register call carry the linked email.** The server now requires the token's `email` to equal the verified address. The phone wizard links that address in `useConfirmPhoneAndLink` and calls `/auth/register` straight after, so force a fresh ID token rather than rely on the SDK having swapped it after the link.
  1. In the test file, add `getIdToken: jest.Mock` to the `mockCurrentUser` type. In `beforeEach`, create the user with `getIdToken: jest.fn().mockResolvedValue('fresh-token')`. Append:

```tsx
it('refreshes the ID token after linking, so /auth/register sees the linked email', async () => {
  mockLinkWithCredential.mockResolvedValue(undefined);
  const { result } = renderConfirmPhoneAndLink();

  await result.current.mutateAsync({
    confirmation: CONFIRMATION,
    code: '111111',
    email: 'mona@example.com',
    password: 'Password1',
  });

  expect(mockCurrentUser?.getIdToken).toHaveBeenCalledWith(true);
});
```

  2. Run it and expect it to fail: `cd apps/mobile && pnpm exec jest src/hooks/__tests__/useAuth.confirmPhoneAndLink.test.tsx`.
  3. In `useAuth.ts`'s `useConfirmPhoneAndLink` `mutationFn`, after the link `try/catch` completes (the last statement of the function), add:

```ts
      // /auth/register comes next and checks that the token's email is the
      // address just verified; force the refresh so it can't carry the claims
      // from before the link.
      await user.getIdToken(true);
```

  4. Run the test again and expect it to pass.

- [ ] **Step 15: E2E flows type the street address.** The lab's map tap may leave the street line empty (reverse geocoding needs a Maps key), and the mother's line is now required. In `c02-mother-registration.yaml`, directly after the `tapOn: point: '50%,44%'` map tap on step 4, add:

```yaml
# The street line is required for every account — type it, as A10 does. After
# the map tap, so a reverse-geocoded line can't overwrite it afterwards.
- tapOn: 'Street address'
- inputText: '1 Test Street, Cairo'
- hideKeyboard
```

  Add the same three steps (with the same comment) to `c11-google-sign-up.yaml`, directly after its step-2 map tap: the `tapOn:` near line 63, before `tapOn: 'Continue'` near line 65. Grep `apps/mobile/e2e/flows` (including `live/`) for any other flow that goes through `Where are you based?` as a mother, and give it the same steps.

- [ ] **Step 16: Keep the manual checklist true.** In `packages/shared/src/qa-scenarios.ts`:
  - **`mother-registration-step-1`:** add the step `'Open the date of birth picker and try to pick a date less than 18 years ago'`, and the expected line `'The picker offers no date that would make her under 18'`.
  - **`mother-registration-location-children`:** add the expected line `'Continue with the pin set but the street line empty asks for a street address'`.
  - **`mother-registration-phone-otp`:** add the expected line `'The photo from step 1 shows on Account details'`.
  - **`account-details`:** add the expected line `'The phone number is shown but cannot be edited'`.

  Then run `pnpm --filter @nanny-app/shared test`, which includes `qa-scenarios.test.ts`.

- [ ] **Step 17: Run everything this task touched.**

Run each and expect it to pass:
- `cd apps/mobile && pnpm exec tsc --noEmit && pnpm exec jest`
- `pnpm --filter @nanny-app/admin typecheck`
- `pnpm --filter @nanny-app/admin test`
- `pnpm --filter @nanny-app/shared test`

- [ ] **Step 18: Commit.**

```bash
git add apps/mobile/src/lib/validation.ts apps/mobile/src/lib/__tests__/validation.test.ts apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx apps/mobile/src/screens/auth/RegistrationStep2Screen.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep2Screen.test.tsx apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx apps/mobile/src/screens/auth/RegistrationNannyDetailsScreen.tsx apps/admin/src/features/nannies/nanny-profile-editor.tsx apps/mobile/src/hooks/useAuth.ts apps/mobile/src/hooks/__tests__/useAuth.confirmPhoneAndLink.test.tsx apps/mobile/e2e/flows/c02-mother-registration.yaml apps/mobile/e2e/flows/c11-google-sign-up.yaml packages/shared/src/qa-scenarios.ts
git commit -m "feat(mobile): the wizard holds the registration rules on screen — 18+, street address, one list of age bands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification (controller, after the final review)

1. `pnpm test:unit`: every package green.
2. `pnpm --filter @nanny-app/backend test:integration` on the local stack.
3. The admin E2E suite (`pnpm --filter @nanny-app/admin test:e2e`) against the lab backend on :3001. It proves the Task 1 helper fix: phone link plus own-folder URLs.
4. Device lab (`mobile-e2e-lab` skill): run `smoke c02 a10 c11 c12` twice. c02 and c11 prove that a mother's photo uploads to the emulator and passes the own-folder check, that the street line is typed, and that the fresh token carries the linked email. a10 proves the nanny path.
