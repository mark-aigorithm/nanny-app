# Registration Availability Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell a person signing up that their email or phone already belongs to an account when they tap Continue on step 1 of the wizard — not on the code screen after it, and not at the very end.

**Architecture:** One new public endpoint, `POST /auth/availability`, reports `{ emailTaken, phoneTaken }`. The lookup it runs is extracted from `registerUser` into a shared helper so step 1 and the final `/auth/register` call can never disagree. The mobile step-1 screen calls it after its local validation and shows an inline error under whichever field is taken.

**Tech Stack:** Zod (`@nanny-app/shared`), Express + Prisma (backend, Jest), Expo/React Native + TanStack Query (mobile, jest-expo + RNTL), supertest (integration).

**Spec:** `Docs/superpowers/specs/2026-09-17-registration-availability-check-design.md`

## Global Constraints

- TypeScript strict; no `any`; `import type` for type-only imports.
- Shared Zod schemas are the only source of request/response types — never redeclare them.
- Backend: routes validate + call one service function; services are the only place that touch Prisma. Expected errors are thrown with `errors.conflict(...)` etc.
- Mobile: all API calls through `api` from `@mobile/lib/api`, wrapped in a TanStack `useMutation` in `hooks/`; no hex colours / font strings in styles — theme tokens only; screen styles live in the `styles/*.styles.ts` file, not the screen.
- Copy is the backend's exact wording: `An account with this email already exists.` and `An account with this phone number already exists.`
- No `deletedAt` filter on the collision lookups — they must report what the unique constraint will do at insert time.
- This machine has no Docker DB by default (see memory `local-dev-constraints`): verify with `typecheck` + unit tests; the integration test is written to run when `pnpm test:env` is up.
- Windows: edit files by their exact on-disk casing (`Docs/`, `apps/mobile/src/components/ui/text-input.tsx`).

---

### Task 1: Shared schemas for the availability check

**Files:**
- Modify: `packages/shared/src/auth.ts:61-77`
- Test: `packages/shared/src/__tests__/auth-availability.test.ts`

**Interfaces:**
- Produces (all exported from `@nanny-app/shared` via `export * from './auth'`):
  - `PhoneE164Schema: z.ZodString` — trimmed, `/^\+\d{7,15}$/`
  - `CheckAvailabilitySchema` / `type CheckAvailabilityRequest = { email: string; phone: string }`
  - `AvailabilityResponseSchema` / `type AvailabilityResponse = { emailTaken: boolean; phoneTaken: boolean }`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/auth-availability.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  AvailabilityResponseSchema,
  CheckAvailabilitySchema,
  RegisterRequestSchema,
} from '../auth';

describe('CheckAvailabilitySchema', () => {
  it('normalises the email the same way every other auth body does', () => {
    const parsed = CheckAvailabilitySchema.parse({
      email: '  Sarah@Example.COM ',
      phone: ' +201001234567 ',
    });
    expect(parsed).toEqual({ email: 'sarah@example.com', phone: '+201001234567' });
  });

  it('refuses a phone that is not E.164', () => {
    const result = CheckAvailabilitySchema.safeParse({
      email: 'sarah@example.com',
      phone: '01001234567',
    });
    expect(result.success).toBe(false);
  });

  it('shares its phone rule with the register body', () => {
    // Same shape must be accepted by both — the availability check answers
    // "what will /auth/register do with this value?".
    const phone = '+201001234567';
    expect(CheckAvailabilitySchema.shape.phone.safeParse(phone).success).toBe(true);
    expect(RegisterRequestSchema.shape.phone.safeParse(phone).success).toBe(true);
    expect(RegisterRequestSchema.shape.phone.safeParse('0100').success).toBe(false);
  });
});

describe('AvailabilityResponseSchema', () => {
  it('is two booleans', () => {
    expect(AvailabilityResponseSchema.parse({ emailTaken: true, phoneTaken: false })).toEqual({
      emailTaken: true,
      phoneTaken: false,
    });
    expect(AvailabilityResponseSchema.safeParse({ emailTaken: 'yes' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=@nanny-app/shared exec vitest run src/__tests__/auth-availability.test.ts`
Expected: FAIL — `CheckAvailabilitySchema` / `AvailabilityResponseSchema` are not exported (TypeError / undefined).

- [ ] **Step 3: Add the schemas**

In `packages/shared/src/auth.ts`, replace the block from `/** Body for POST /auth/email — an existing user attaches a proven address. */` down through the `phone:` field of `RegisterRequestSchema` so it reads:

```ts
/** Body for POST /auth/email — an existing user attaches a proven address. */
export const SetVerifiedEmailSchema = z.object({
  email: EmailSchema,
  verificationToken: z.string().min(1),
});
export type SetVerifiedEmailRequest = z.infer<typeof SetVerifiedEmailSchema>;

/**
 * A phone number as the auth surface stores and compares it: E.164, nothing
 * else. `users.phone` is unique on exactly this string, so every body that
 * carries a phone must normalise to it or a lookup will miss.
 */
export const PhoneE164Schema = z
  .string()
  .trim()
  .regex(/^\+\d{7,15}$/, 'phone must be E.164, e.g. +15551234567');

/**
 * Body for POST /auth/availability — asked from step 1 of the wizard, before
 * anything is sent or created, so a taken email or phone is refused while the
 * fields are still on screen rather than at the end of the wizard.
 */
export const CheckAvailabilitySchema = z.object({ email: EmailSchema, phone: PhoneE164Schema });
export type CheckAvailabilityRequest = z.infer<typeof CheckAvailabilitySchema>;

/**
 * A true flag means POST /auth/register would refuse that value with a 409.
 * Both can be true at once; the client reports each under its own field.
 */
export const AvailabilityResponseSchema = z.object({
  emailTaken: z.boolean(),
  phoneTaken: z.boolean(),
});
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

/** Body for POST /auth/register — fields not in Firebase. */
export const RegisterRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    // Email is also on the Firebase token, but we accept and validate it here
    // so the backend doesn't have to derive it from the JWT for the insert.
    email: EmailSchema,
    // Proof from POST /auth/email/verify that this address belongs to whoever
    // is registering. Both roles prove their address mid-wizard, so no account
    // is ever created with an unproven one — which is what lets receipts,
    // payment records and account recovery rely on `users.email`.
    emailVerificationToken: z.string().min(1, 'Please verify your email address before finishing sign-up.'),
    phone: PhoneE164Schema,
```

(Everything after `phone:` in `RegisterRequestSchema` is unchanged.)

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter=@nanny-app/shared exec vitest run src/__tests__/auth-availability.test.ts && pnpm --filter=@nanny-app/shared typecheck`
Expected: 4 tests PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/auth.ts packages/shared/src/__tests__/auth-availability.test.ts
git commit -m "feat(shared): schemas for the registration availability check

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: One collision lookup, shared by `checkAvailability` and `registerUser`

**Files:**
- Modify: `apps/backend/src/services/auth.service.ts:5-16` (imports) and `:67-98` (`registerUser` collision block)
- Test: `apps/backend/src/__tests__/auth-availability.test.ts`

**Interfaces:**
- Consumes: `CheckAvailabilityRequest`, `AvailabilityResponse` from Task 1.
- Produces: `export async function checkAvailability(body: CheckAvailabilityRequest): Promise<AvailabilityResponse>` in `@backend/services/auth.service`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/auth-availability.test.ts`:

```ts
/**
 * `checkAvailability` answers step 1 of the wizard: is this email or phone
 * already somebody's? It must give the same answer `registerUser` gives at the
 * end, so both are exercised here against one `findUnique` mock.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/admin-nanny.service', () => ({
  reconcileNannySkills: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
}));

import { Role, type RegisterRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import { checkAvailability, registerUser } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const TAKEN_EMAIL = 'taken@example.com';
const TAKEN_PHONE = '+201000000001';
const FREE_EMAIL = 'free@example.com';
const FREE_PHONE = '+201000000002';

/** A fresh Firebase uid — no existing row for it, so registration proceeds to the collision checks. */
const DECODED = { uid: 'fb-new', phone_number: FREE_PHONE } as never;

const MOTHER_BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: FREE_EMAIL,
  phone: FREE_PHONE,
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: '1.0',
  latitude: 30.05,
  longitude: 31.23,
  emailVerificationToken: 'b'.repeat(64),
};

/**
 * Answer `findUnique` the way the DB would: a row for the taken email, a row
 * for the taken phone, nothing for anything else (including the new uid).
 */
function seedOwners() {
  mockPrisma.user.findUnique.mockImplementation(
    ({ where }: { where: { email?: string; phone?: string; firebaseUid?: string } }) => {
      if (where.email === TAKEN_EMAIL) return Promise.resolve({ id: 1, email: TAKEN_EMAIL });
      if (where.phone === TAKEN_PHONE) return Promise.resolve({ id: 2, phone: TAKEN_PHONE });
      return Promise.resolve(null);
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  seedOwners();
});

describe('checkAvailability', () => {
  it('reports both free', async () => {
    await expect(checkAvailability({ email: FREE_EMAIL, phone: FREE_PHONE })).resolves.toEqual({
      emailTaken: false,
      phoneTaken: false,
    });
  });

  it('reports a taken email on its own', async () => {
    await expect(checkAvailability({ email: TAKEN_EMAIL, phone: FREE_PHONE })).resolves.toEqual({
      emailTaken: true,
      phoneTaken: false,
    });
  });

  it('reports a taken phone on its own', async () => {
    await expect(checkAvailability({ email: FREE_EMAIL, phone: TAKEN_PHONE })).resolves.toEqual({
      emailTaken: false,
      phoneTaken: true,
    });
  });

  it('reports both taken at once, so the client can flag both fields', async () => {
    await expect(checkAvailability({ email: TAKEN_EMAIL, phone: TAKEN_PHONE })).resolves.toEqual({
      emailTaken: true,
      phoneTaken: true,
    });
  });

  it('looks the values up exactly as given — the route has already normalised them', async () => {
    await checkAvailability({ email: FREE_EMAIL, phone: FREE_PHONE });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: FREE_EMAIL } });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: FREE_PHONE } });
  });
});

describe('registerUser still refuses what checkAvailability reports as taken', () => {
  it('409s on a taken email, with the same message step 1 shows', async () => {
    const err = await registerUser(DECODED, { ...MOTHER_BODY, email: TAKEN_EMAIL }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).message).toBe('An account with this email already exists.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('409s on a taken phone, with the same message step 1 shows', async () => {
    const err = await registerUser(DECODED, { ...MOTHER_BODY, phone: TAKEN_PHONE }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).message).toBe('An account with this phone number already exists.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('names the email first when both are taken', async () => {
    const err = await registerUser(DECODED, {
      ...MOTHER_BODY,
      email: TAKEN_EMAIL,
      phone: TAKEN_PHONE,
    }).catch((e: unknown) => e);
    expect((err as AppError).message).toBe('An account with this email already exists.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=@nanny-app/backend exec jest --selectProjects unit src/__tests__/auth-availability.test.ts`
Expected: FAIL — `checkAvailability` is not exported from auth.service (TypeError: checkAvailability is not a function). The three `registerUser` cases pass already; that is expected — they pin behaviour the refactor must keep.

- [ ] **Step 3: Extract the helper and add `checkAvailability`**

In `apps/backend/src/services/auth.service.ts`, add the two types to the `@nanny-app/shared` import:

```ts
import {
  getMissingNannyProfileFields,
  Role,
  type AvailabilityResponse,
  type CheckAvailabilityRequest,
  type Child as ChildDto,
  type RegisterRequest,
  type Role as ApiRole,
  type SaveChildrenRequest,
  type SetVerifiedEmailRequest,
  type SubmitIdRequest,
  type UpdateProfileRequest,
  type UserResponse,
} from '@nanny-app/shared';
```

Then, directly above the `registerUser` doc comment (after `toUserResponse`), insert:

```ts
/**
 * Whether an email or phone already belongs to a user row. This is the one
 * rule for "taken", asked twice: from step 1 of the wizard via
 * `checkAvailability`, and again by `registerUser` before the insert — so the
 * early answer and the final one cannot drift apart.
 *
 * Deliberately no `deletedAt` filter: `users.email` and `users.phone` are
 * unique columns, so a soft-deleted row still holding the value would make the
 * insert fail, and this must report what the insert will do. (Rows freed for
 * re-registration have those columns mangled — see test/e2e/seed-mobile.ts.)
 */
async function findIdentityOwners(email: string, phone: string): Promise<AvailabilityResponse> {
  const [emailOwner, phoneOwner] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { phone } }),
  ]);
  return { emailTaken: emailOwner !== null, phoneTaken: phoneOwner !== null };
}

/**
 * Step 1 of the wizard asks this before moving on, so a taken email or phone
 * is refused while the fields are still on screen. Public and side-effect
 * free; the body has already been normalised by CheckAvailabilitySchema.
 */
export async function checkAvailability(
  body: CheckAvailabilityRequest,
): Promise<AvailabilityResponse> {
  return findIdentityOwners(body.email, body.phone);
}
```

Then in `registerUser`, replace the collision block:

```ts
  // Email collision check (different Firebase UID, same email) — surfaces a
  // friendlier error than letting the unique constraint blow up.
  const emailOwner = await prisma.user.findUnique({ where: { email: body.email } });
  if (emailOwner) {
    throw errors.conflict('An account with this email already exists.');
  }

  const phoneOwner = await prisma.user.findUnique({ where: { phone: body.phone } });
  if (phoneOwner) {
    throw errors.conflict('An account with this phone number already exists.');
  }
```

with:

```ts
  // Collision check (different Firebase UID, same email or phone) — the same
  // lookup step 1 of the wizard ran, so this only fires if the value was taken
  // in between. Surfaces a friendlier error than letting the unique constraint
  // blow up.
  const { emailTaken, phoneTaken } = await findIdentityOwners(body.email, body.phone);
  if (emailTaken) {
    throw errors.conflict('An account with this email already exists.');
  }
  if (phoneTaken) {
    throw errors.conflict('An account with this phone number already exists.');
  }
```

- [ ] **Step 4: Run the new test and the existing register tests**

Run: `pnpm --filter=@nanny-app/backend exec jest --selectProjects unit src/__tests__/auth-availability.test.ts src/__tests__/auth-register-nanny-profile.test.ts src/__tests__/auth-service-id.test.ts`
Expected: all PASS (8 new + the existing ones).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter=@nanny-app/backend typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/auth.service.ts apps/backend/src/__tests__/auth-availability.test.ts
git commit -m "feat(backend): checkAvailability shares registerUser's collision lookup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `POST /auth/availability` route + integration coverage

**Files:**
- Modify: `apps/backend/src/routes/auth.routes.ts:3-30` (imports) and after the `/email/verify` handler
- Test: `apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts` (new `it` block)

**Interfaces:**
- Consumes: `checkAvailability` (Task 2), `CheckAvailabilitySchema` (Task 1).
- Produces: `POST /auth/availability` → `200 { data: { emailTaken, phoneTaken }, error: null }`; `400` on a malformed body.

- [ ] **Step 1: Write the failing integration test**

In `apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts`, inside `describe('A10 — nanny onboarding and approval', …)`, add after the first `it(...)`:

```ts
  it('tells step 1 of the wizard when a phone or email is already taken', async () => {
    const takenPhone = '+201099990001';
    const mother = await makeMother({ phone: takenPhone });

    // Her phone, a fresh email: only the phone is reported.
    const partial = await request(app)
      .post('/auth/availability')
      .send({ email: `fresh-${process.pid}-${Date.now()}@test.local`, phone: takenPhone });
    expect(partial.status).toBe(200);
    expect(partial.body.data).toEqual({ emailTaken: false, phoneTaken: true });

    // Her email, capitalised the way a phone keyboard might, and a fresh phone.
    const emailOnly = await request(app)
      .post('/auth/availability')
      .send({ email: mother.email.toUpperCase(), phone: '+201099990002' });
    expect(emailOnly.status).toBe(200);
    expect(emailOnly.body.data).toEqual({ emailTaken: true, phoneTaken: false });

    // Both fresh: nothing to report, and no auth was needed to ask.
    const free = await request(app)
      .post('/auth/availability')
      .send({ email: `free-${process.pid}-${Date.now()}@test.local`, phone: '+201099990003' });
    expect(free.status).toBe(200);
    expect(free.body.data).toEqual({ emailTaken: false, phoneTaken: false });

    // A local-format phone is a 400, not a silent "free".
    const malformed = await request(app)
      .post('/auth/availability')
      .send({ email: mother.email, phone: '01099990001' });
    expect(malformed.status).toBe(400);
  });
```

- [ ] **Step 2: Run it to verify it fails (only if the test stack is up)**

Run: `pnpm --filter=@nanny-app/backend exec jest --selectProjects integration src/__integration__/journeys/a10-nanny-onboarding.test.ts -t "already taken"`
Expected: FAIL — `partial.status` is 404 (route does not exist). If the stack is down the run fails at `globalSetup` instead; note that and continue — Step 5 covers the route without a DB.

- [ ] **Step 3: Add the route**

In `apps/backend/src/routes/auth.routes.ts`, extend the shared import:

```ts
import {
  CheckAvailabilitySchema,
  RegisterRequestSchema,
  SaveChildrenSchema,
  SendEmailOtpSchema,
  SetVerifiedEmailSchema,
  SubmitIdRequestSchema,
  UpdateProfileRequestSchema,
  VerifyEmailOtpSchema,
} from '@nanny-app/shared';
```

and the service import:

```ts
import {
  checkAvailability,
  registerUser,
  getMe,
  getMyChildren,
  saveMyChildren,
  setVerifiedEmail,
  submitId,
  updateProfile,
} from '@backend/services/auth.service';
```

Then insert this handler directly **before** the `POST /auth/email/otp` block:

```ts
/**
 * POST /auth/availability
 * Step 1 of the registration wizard asks whether the email and phone just
 * typed already belong to an account, so a collision is shown under the field
 * instead of on the code screen (email) or at the very end (phone). Public,
 * like the OTP send below, because the caller has no account yet. Reports the
 * same answer /auth/register will give — both call one service lookup.
 *
 * This is an enumeration oracle for phone numbers, as /auth/email/otp already
 * is for addresses; both wait on the per-IP limiter (FOUND-05).
 */
authRouter.post(
  '/availability',
  validateBody(CheckAvailabilitySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await checkAvailability(req.body)));
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 4: Run the integration test (if the stack is up)**

Run: `pnpm --filter=@nanny-app/backend exec jest --selectProjects integration src/__integration__/journeys/a10-nanny-onboarding.test.ts -t "already taken"`
Expected: PASS.

- [ ] **Step 5: Typecheck and the unit suite (route table + any router-walking test)**

Run: `pnpm --filter=@nanny-app/backend typecheck && pnpm --filter=@nanny-app/backend test:unit`
Expected: clean; all unit tests PASS (the admin-permissions router walk only covers `/admin`, so the new public route needs no table row).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/auth.routes.ts apps/backend/src/__integration__/journeys/a10-nanny-onboarding.test.ts
git commit -m "feat(backend): POST /auth/availability for the wizard's first step

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Step 1 refuses a taken email or phone before moving on

**Files:**
- Modify: `apps/mobile/src/hooks/useAuth.ts:1-8` (imports) and after `useSendEmailOtp`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx`
- Modify: `apps/mobile/src/screens/auth/styles/registration-step1-screen.styles.ts` (after `phoneInput`)
- Test: `apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`

**Interfaces:**
- Consumes: `CheckAvailabilityRequest`, `AvailabilityResponse` (Task 1); `POST /auth/availability` (Task 3); `api`, `unwrap`, `getApiErrorMessage` from `@mobile/lib/api`; `toE164` from `@mobile/lib/validation`.
- Produces: `useCheckAvailability(): UseMutationResult<AvailabilityResponse, Error, CheckAvailabilityRequest>` in `@mobile/hooks/useAuth`.

- [ ] **Step 1: Write the failing screen test**

Create `apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Router + route params are the per-file mocks; firebase, the API layer, the
// image picker and safe-area insets come from the global jest.setup.js.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ role: 'parent' }),
}));

// Native date picker has no jest implementation; the screen only mounts it
// inside a closed modal, so an empty component is enough.
jest.mock('@react-native-community/datetimepicker', () => () => null);

// Pulls in expo-asset at import; the real thing only matters under E2E.
jest.mock('@mobile/lib/e2eImage', () => ({
  e2ePlaceholderImageUri: jest.fn().mockResolvedValue(null),
}));

import { api } from '@mobile/lib/api';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import RegistrationStep1Screen from '@mobile/screens/auth/RegistrationStep1Screen';

const mockPost = api.post as jest.Mock;

const EMAIL_TAKEN = 'An account with this email already exists.';
const PHONE_TAKEN = 'An account with this phone number already exists.';

/** A fully filled step 1, so only the availability check stands between Continue and step 2. */
function fillDraft() {
  useRegistrationDraftStore.setState({
    role: 'parent',
    firstName: 'Nanny',
    lastName: 'Test',
    email: 'Mark3Essam@gmail.com',
    countryCode: '+20',
    phone: '1234567893',
    dob: '05/10/1998',
    photoUri: 'file:///photo.jpg',
  });
}

function availability(emailTaken: boolean, phoneTaken: boolean) {
  return { data: { data: { emailTaken, phoneTaken }, error: null } };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationStep1Screen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  fillDraft();
});

describe('RegistrationStep1Screen — availability check on Continue', () => {
  it('asks the API with the normalised email and E.164 phone, then moves on when both are free', async () => {
    mockPost.mockResolvedValueOnce(availability(false, false));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/availability', {
        email: 'mark3essam@gmail.com',
        phone: '+201234567893',
      }),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/register-email',
        params: { role: 'parent' },
      }),
    );
  });

  it('flags a taken email under the field and stays put', async () => {
    mockPost.mockResolvedValueOnce(availability(true, false));
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText(EMAIL_TAKEN)).toBeTruthy());
    expect(queryByText(PHONE_TAKEN)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('flags a taken phone under the field and stays put', async () => {
    mockPost.mockResolvedValueOnce(availability(false, true));
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText(PHONE_TAKEN)).toBeTruthy());
    expect(queryByText(EMAIL_TAKEN)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('flags both at once', async () => {
    mockPost.mockResolvedValueOnce(availability(true, true));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText(EMAIL_TAKEN)).toBeTruthy());
    expect(getByText(PHONE_TAKEN)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as that field is edited', async () => {
    mockPost.mockResolvedValueOnce(availability(true, true));
    const { getByText, queryByText, getByPlaceholderText } = renderScreen();

    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText(EMAIL_TAKEN)).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'other@example.com');
    expect(queryByText(EMAIL_TAKEN)).toBeNull();
    // The phone error is untouched until the phone changes.
    expect(getByText(PHONE_TAKEN)).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('100 000 0000'), '1000000000');
    expect(queryByText(PHONE_TAKEN)).toBeNull();
  });

  it('stays on the screen with a form error when the check itself fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(getByText('Could not check your details. Please try again.')).toBeTruthy(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not call the API while local validation is still failing', () => {
    useRegistrationDraftStore.setState({ email: 'not-an-address' });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter=@nanny-app/mobile exec jest src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`
Expected: FAIL — the first test's `mockPost` expectation never fires (Continue navigates without calling the API); the taken-email/phone tests can't find the error text.

- [ ] **Step 3: Add the mutation hook**

In `apps/mobile/src/hooks/useAuth.ts`, extend the shared type import:

```ts
import type {
  AvailabilityResponse,
  CheckAvailabilityRequest,
  RegisterRequest,
  SetVerifiedEmailRequest,
  UserResponse,
  VerifyEmailOtpRequest,
  VerifyEmailOtpResponse,
} from '@nanny-app/shared';
```

Then insert directly **before** the `useSendEmailOtp` doc comment:

```ts
/**
 * Asks whether an email and phone already belong to an account. Step 1 of the
 * wizard calls this on Continue so a collision is shown under the field, not
 * on the code screen after it or at the very end of the wizard. Signed-out,
 * like the OTP send: the caller has no account yet.
 */
export function useCheckAvailability() {
  return useMutation<AvailabilityResponse, Error, CheckAvailabilityRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/availability', body)),
  });
}
```

- [ ] **Step 4: Add the styles**

In `apps/mobile/src/screens/auth/styles/registration-step1-screen.styles.ts`, directly after the `phoneInput` entry, add:

```ts
  // Mirrors TextInputField's error treatment, which the raw phone input
  // cannot use: red border on the box, red line of copy beneath the row.
  phoneInputError: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  fieldErrorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.error,
  },
```

- [ ] **Step 5: Wire the screen**

In `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx`:

Imports — add `toE164` to the validation import, and two new imports:

```ts
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useCheckAvailability } from '@mobile/hooks/useAuth';
import { getApiErrorMessage } from '@mobile/lib/api';
import { validateEmail, validatePhone, toE164 } from '@mobile/lib/validation';
import { styles } from './styles/registration-step1-screen.styles';
import { noticeDialog } from '@mobile/store/confirmDialogStore';
```

Module-level copy, after `MIN_DOB`:

```ts
// The backend's own wording, so the two surfaces read the same.
const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists.';
const PHONE_TAKEN_MESSAGE = 'An account with this phone number already exists.';
```

State — after `const [formError, setFormError] = useState<string | null>(null);`:

```ts
  // Per-field "already taken" errors from the availability check. Kept apart
  // from formError so each sits under the field it is about, and so editing
  // that field — and only that field — clears it.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const checkAvailability = useCheckAvailability();
```

Replace `handleContinue` in full:

```ts
  async function handleContinue() {
    setFormError(null);
    if (!draft.photoUri) {
      setShowPhotoError(true);
      return;
    }
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setFormError('Please enter your first and last name.');
      return;
    }
    const phoneErr = validatePhone(draft.phone);
    if (phoneErr) {
      setFormError(phoneErr);
      return;
    }
    // The address is verified on the very next screen, so a typo has to be
    // caught here — the code would otherwise be sent somewhere they can't
    // read, with no way back but the back button.
    const emailErr = validateEmail(draft.email);
    if (emailErr) {
      setFormError(emailErr);
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(draft.dob)) {
      setFormError('Please select your date of birth.');
      return;
    }

    // Refuse an email or phone that already belongs to an account here, while
    // the fields are still on screen — not on the code screen after it (where
    // the OTP send used to be the first to notice the email) and not at the
    // very end of the wizard (where /auth/register was the first to notice the
    // phone). Fail closed on a network error: the next screen's OTP send needs
    // the same connectivity, so letting them through only moves the failure.
    let availability;
    try {
      availability = await checkAvailability.mutateAsync({
        email: draft.email.trim().toLowerCase(),
        phone: toE164(draft.countryCode, draft.phone),
      });
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Could not check your details. Please try again.'));
      return;
    }
    setEmailError(availability.emailTaken ? EMAIL_TAKEN_MESSAGE : null);
    setPhoneError(availability.phoneTaken ? PHONE_TAKEN_MESSAGE : null);
    if (availability.emailTaken || availability.phoneTaken) return;

    router.push({ pathname: '/(auth)/register-email', params: { role } });
  }
```

Email field — add `error` and clear-on-edit:

```tsx
            <TextInputField
              label="Email"
              value={draft.email}
              onChangeText={(val) => {
                patch({ email: val });
                if (emailError) setEmailError(null);
              }}
              error={emailError}
              placeholder="you@example.com"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />
```

Phone field — red border while flagged, clear-on-edit, error line under the row:

```tsx
            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>{draft.countryCode}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
                {/* Placeholder is an Egyptian mobile with the leading 0
                    dropped — the country-code box already carries the +20. */}
                <TextInput
                  style={[styles.phoneInput, phoneError ? styles.phoneInputError : undefined]}
                  value={draft.phone}
                  onChangeText={(val) => {
                    patch({ phone: val });
                    if (phoneError) setPhoneError(null);
                  }}
                  placeholder="100 000 0000"
                  placeholderTextColor={colors.textPlaceholder}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
              </View>
              {phoneError && <Text style={styles.fieldErrorText}>{phoneError}</Text>}
            </View>
```

Footer button — busy state while the check runs:

```tsx
        <View style={styles.footer}>
          <Button
            title={checkAvailability.isPending ? 'Checking…' : 'Continue'}
            onPress={() => void handleContinue()}
            disabled={checkAvailability.isPending}
          />
        </View>
```

- [ ] **Step 6: Run the screen test**

Run: `pnpm --filter=@nanny-app/mobile exec jest src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx`
Expected: 7 tests PASS.

If `let availability;` trips `noImplicitAny`, type it explicitly: `let availability: AvailabilityResponse;` with `import type { AvailabilityResponse } from '@nanny-app/shared';` added to the screen's imports.

- [ ] **Step 7: Typecheck and the full mobile unit suite**

Run: `pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test:unit`
Expected: clean; all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/hooks/useAuth.ts apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx apps/mobile/src/screens/auth/styles/registration-step1-screen.styles.ts apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx
git commit -m "feat(mobile): refuse a taken email or phone on the wizard's first step

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Update the two comments that described the old behaviour

**Files:**
- Modify: `apps/mobile/src/screens/auth/RegistrationEmailScreen.tsx:23-35` (doc comment)
- Modify: `apps/backend/src/services/email-verification.service.ts:46-52` (`assertEmailAvailable` doc comment)

No test — comments only; the previous tasks' suites are the gate.

- [ ] **Step 1: RegistrationEmailScreen doc comment**

Replace the paragraph starting `Verifying here rather than at the end is deliberate:` with:

```ts
 * Verifying here rather than at the end is deliberate: a typo'd address is
 * caught before the rest of the wizard is filled in, and no account can be
 * created carrying an address nobody can read. "Already taken" is not this
 * screen's job any more — step 1 asks /auth/availability before pushing here,
 * so the 409 the send can still return only fires on a race.
```

- [ ] **Step 2: `assertEmailAvailable` doc comment**

Replace the sentence `Mirrors the collision check in auth.service.ts's registerUser, which surfaces a friendlier error than letting the unique constraint blow up later.` with:

```ts
 * Backstop for the check step 1 of the wizard already ran via
 * /auth/availability (registerUser's `findIdentityOwners`); it fires only if
 * the address was taken in between.
```

- [ ] **Step 3: Typecheck both packages and commit**

Run: `pnpm --filter=@nanny-app/backend typecheck && pnpm --filter=@nanny-app/mobile typecheck`
Expected: clean.

```bash
git add apps/mobile/src/screens/auth/RegistrationEmailScreen.tsx apps/backend/src/services/email-verification.service.ts
git commit -m "docs: note that step 1 now owns the taken-email/phone check

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
