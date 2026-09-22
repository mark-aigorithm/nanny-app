# Phone-first auth with Firebase-owned password reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the user's real verified email on the Firebase account so Firebase can own password-reset mail, make phone + SMS the default sign-in door with email + password secondary, and validate the result against live Firebase.

**Architecture:** The Firebase credential address changes from the synthesized `<digits>@phone.nannyapp.local` to the real address that registration already proves with our own email OTP. Sign-in therefore stops deriving a credential from the phone number and instead signs in *by* phone (SMS code), with an email + password door behind a link. `setVerifiedEmail` becomes the migration path for accounts created before this change, and a one-off script converts the rest. Both SMS paths gain a guard that deletes the phone-only Firebase account Firebase mints when a code is confirmed for a number that has no account.

**Tech Stack:** Expo/React Native (`@react-native-firebase/auth`), Express + Prisma + firebase-admin, Jest (backend unit/integration), jest-expo + React Native Testing Library (mobile unit), Maestro (device E2E).

## Global Constraints

- Spec: `Docs/superpowers/specs/2026-09-23-phone-first-auth-firebase-reset-design.md`. Read it before Task 1.
- TypeScript strict; **no `any`** — use `unknown` + a type guard.
- Mobile: no hardcoded hex colors, font strings or shadows — use `@mobile/theme` tokens. Screen styles live in `screens/<area>/styles/<screen-name>.styles.ts`.
- Backend: services are the only place that touch Prisma / Firebase; routes validate and call one service function; errors are thrown as `errors.*` from `@backend/lib/errors`.
- Soft delete only in the DB (`deletedAt`), never `delete()`.
- The live-E2E harness runs against the production Firebase project. **Its allowlist is exactly `+201234567891` and `+201234567892`.** Every create/sign-in/delete asserts membership; deletion additionally requires that this run created the uid. No `listUsers`, no bulk delete, ever.
- Test phone codes (Firebase console, fixed, no SMS sent): `+201234567891` → `111111`, `+201234567892` → `222222`.
- Commit after every task. Run `pnpm --filter=@nanny-app/backend typecheck` / `pnpm --filter=@nanny-app/mobile typecheck` before each commit (ESLint is broken repo-wide — do not rely on it).

---

## File Structure

**Backend**
- Modify `apps/backend/src/services/auth.service.ts` — `registerUser` marks the Firebase account verified; `setVerifiedEmail` swaps the Firebase address before spending the token.
- Create `apps/backend/src/__tests__/auth-firebase-email.test.ts` — unit cover for both.
- Modify `apps/backend/src/__integration__/journeys/a14-mother-email-gate.test.ts` — assert the emulator account's address flipped.
- Create `apps/backend/prisma/migrate-firebase-emails.ts` — one-off, dry-run by default.
- Create `apps/backend/src/services/e2e-auth.service.ts` — the live-E2E harness operations, allowlist-guarded.
- Create `apps/backend/src/routes/e2e-auth.routes.ts` — flag-gated router over that service.
- Modify `apps/backend/src/lib/config.ts`, `apps/backend/src/routes/index.ts` — the flag and the mount.
- Create `apps/backend/src/__tests__/e2e-auth-guard.test.ts` — the allowlist refuses everything else.

**Mobile**
- Rewrite `apps/mobile/src/screens/auth/SignInScreen.tsx` (+ its styles) — the SMS door.
- Create `apps/mobile/src/screens/auth/EmailSignInScreen.tsx` (+ styles) and `apps/mobile/app/(auth)/sign-in-email.tsx`.
- Modify `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx` (+ styles) — channel chooser, email reset, SMS guard.
- Modify `apps/mobile/src/hooks/useAuth.ts` — `useConfirmPhoneSignIn`, `useSendPasswordResetEmail`, and the guard inside `useConfirmPhoneAndResetPassword`.
- Modify `apps/mobile/src/lib/authErrors.ts` — email-door copy, debug output removed.
- Modify `apps/mobile/src/lib/validation.ts` — delete `phoneToPlaceholderEmail`.
- Modify `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx:148` — link the real address.
- Modify `apps/mobile/src/screens/auth/VerifyEmailScreen.tsx` — `user.reload()` on success.
- Create `apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx`, `ForgotPasswordScreen.test.tsx`.

**E2E**
- Modify `apps/backend/test/e2e/seed-mobile.ts`, `apps/mobile/e2e/accounts.mjs`, `apps/mobile/e2e/run.mjs`, `apps/mobile/e2e/flows/_sign-in.yaml`.
- Delete `apps/mobile/e2e/flows/c01-session-lifecycle.yaml` (replaced by the live suite).
- Create `apps/mobile/e2e/live.mjs` and `apps/mobile/e2e/flows/live/*.yaml`.
- Modify `apps/mobile/e2e/scripts/advance.js` — live-harness steps.

---

## Task 1: Backend — the Firebase address becomes the real one

**Files:**
- Modify: `apps/backend/src/services/auth.service.ts` (`registerUser` ~`:153-236`, `setVerifiedEmail` `:347-377`)
- Test: `apps/backend/src/__tests__/auth-firebase-email.test.ts` (create)

**Interfaces:**
- Consumes: `firebaseAuth` from `@backend/lib/firebase`; `errors` from `@backend/lib/errors`.
- Produces: `setVerifiedEmail` now calls `firebaseAuth.updateUser(uid, { email, emailVerified: true })` **before** `consumeVerificationToken`; `registerUser` calls `firebaseAuth.updateUser(uid, { emailVerified: true })` after the transaction.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/__tests__/auth-firebase-email.test.ts`:

```typescript
import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    address: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { updateUser: jest.fn() },
}));

jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { consumeVerificationToken } from '@backend/services/email-verification.service';
import { registerUser, setVerifiedEmail } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockUpdateUser = firebaseAuth.updateUser as unknown as jest.Mock;
const mockConsume = consumeVerificationToken as unknown as jest.Mock;

const DECODED = { uid: 'fb-1', phone_number: '+201000000000' } as never;

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firebaseUid: 'fb-1',
    email: '201000000000@phone.nannyapp.local',
    phone: '+201000000000',
    firstName: 'Mona',
    lastName: 'Ali',
    dateOfBirth: new Date('1994-01-01'),
    avatarUrl: null,
    role: Role.MOTHER,
    isEmailVerified: false,
    isPhoneVerified: true,
    approvalStatus: 'APPROVED',
    idDocumentType: null,
    rejectionReason: null,
    deletedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue(undefined);
  mockConsume.mockResolvedValue(undefined);
});

describe('setVerifiedEmail', () => {
  it('writes the real address onto the Firebase account before spending the token', async () => {
    const order: string[] = [];
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockUpdateUser.mockImplementation(async () => {
      order.push('firebase');
    });
    mockConsume.mockImplementation(async () => {
      order.push('token');
    });
    mockPrisma.user.update.mockResolvedValue(
      userRow({ email: 'mona@example.com', isEmailVerified: true }),
    );

    await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', {
      email: 'mona@example.com',
      emailVerified: true,
    });
    expect(order).toEqual(['firebase', 'token']);
  });

  it('leaves the token unspent when Firebase refuses the address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockUpdateUser.mockRejectedValue(
      Object.assign(new Error('exists'), { code: 'auth/email-already-exists' }),
    );

    await expect(
      setVerifiedEmail(DECODED, { email: 'taken@example.com', verificationToken: 'tok-1' }),
    ).rejects.toThrow('An account with this email already exists.');

    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('is a no-op when she already holds the verified address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({ email: 'mona@example.com', isEmailVerified: true }),
    );

    await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockConsume).not.toHaveBeenCalled();
  });
});

describe('registerUser', () => {
  it('marks the freshly-created Firebase account email-verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: jest.fn().mockResolvedValue(userRow({ isEmailVerified: true })) },
        address: { create: jest.fn().mockResolvedValue({ formattedAddress: 'Cairo', latitude: 30, longitude: 31 }) },
        $executeRaw: jest.fn(),
      }),
    );

    await registerUser(DECODED, {
      firstName: 'Mona',
      lastName: 'Ali',
      email: 'mona@example.com',
      phone: '+201000000000',
      dateOfBirth: '1994-01-01',
      role: Role.MOTHER,
      termsAcceptedVersion: '1.0',
      latitude: 30.05,
      longitude: 31.23,
      address: 'Cairo',
      emailVerificationToken: 'tok-1',
    } as never);

    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', { emailVerified: true });
  });
});
```

> The `registerUser` transaction mock must match the real body. Open `auth.service.ts:153-229` first and mirror exactly the `tx.*` calls it makes — if it creates a nanny profile or skills, add those mocks. Do not change the service to fit the test.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter=@nanny-app/backend test:unit -- auth-firebase-email
```

Expected: FAIL — `updateUser` was never called.

- [ ] **Step 3: Implement**

In `apps/backend/src/services/auth.service.ts`, add the import:

```typescript
import { firebaseAuth } from '@backend/lib/firebase';
```

(If `DecodedIdToken` is already imported from that module, extend that import rather than adding a second one.)

Add this helper above `setVerifiedEmail`:

```typescript
/**
 * Moves the account's Firebase address to the one she just proved.
 *
 * Firebase keys the password credential by email, so this is what makes
 * `sendPasswordResetEmail` reach a real inbox — and it is the migration path
 * for accounts created while the credential was a phone-derived placeholder.
 * Called *before* the token is spent: a refusal here must leave the token
 * spendable so a retry can succeed.
 */
async function moveFirebaseEmail(uid: string, email: string): Promise<void> {
  try {
    await firebaseAuth.updateUser(uid, { email, emailVerified: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      throw errors.conflict('An account with this email already exists.');
    }
    throw err;
  }
}
```

In `setVerifiedEmail`, insert the call between the owner check and the token consume:

```typescript
  const emailOwner = await prisma.user.findFirst({
    where: { email: body.email, id: { not: user.id }, deletedAt: null },
    select: { id: true },
  });
  if (emailOwner) {
    throw errors.conflict('An account with this email already exists.');
  }

  // Firebase first: a failure here must not burn the token.
  await moveFirebaseEmail(user.firebaseUid, body.email);

  await consumeVerificationToken(body.email, body.verificationToken);
```

In `registerUser`, after the transaction returns and before `toUserResponse`:

```typescript
  // Our own OTP proved the address inside the transaction above; keep
  // Firebase's copy of that fact in step, so reset mail is never held back.
  await firebaseAuth.updateUser(decoded.uid, { emailVerified: true });
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter=@nanny-app/backend test:unit -- auth-firebase-email
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole unit project and typecheck**

```bash
pnpm --filter=@nanny-app/backend test:unit && pnpm --filter=@nanny-app/backend typecheck
```

Expected: PASS. `auth-service-id.test.ts` and `auth-register-*.test.ts` mock `@backend/db/prisma` but not `@backend/lib/firebase` — they will now fail on a real `firebaseAuth`. Add the same `jest.mock('@backend/lib/firebase', () => ({ firebaseAuth: { updateUser: jest.fn() } }))` block to each failing file; change nothing else in them.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/auth.service.ts apps/backend/src/__tests__/
git commit -m "feat(auth): put the proven email on the Firebase account

Firebase keys a password by email and can only mail the address it holds, so
the phone-derived placeholder made its own reset mail undeliverable.
setVerifiedEmail now moves the Firebase address before spending the token — a
refusal leaves the token spendable — which doubles as the migration path for
accounts created before registration proved an address.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Backend integration — the gate really flips the Firebase address

**Files:**
- Modify: `apps/backend/src/__integration__/journeys/a14-mother-email-gate.test.ts`

**Interfaces:**
- Consumes: Task 1's `setVerifiedEmail` behaviour; the existing `test/factories` and `firebaseAuth`.
- Produces: nothing downstream.

**Prerequisite:** the test stack must be up — `pnpm test:env` from the repo root (Docker Desktop lives on D: and starts cold; give it time).

- [ ] **Step 1: Read the existing journey**

```bash
sed -n 1,120p apps/backend/src/__integration__/journeys/a14-mother-email-gate.test.ts
```

Note the name of the test that walks the gate to success, and how it obtains the mother's `firebaseUid`.

- [ ] **Step 2: Add the failing assertion**

Inside that success test, after the request that spends the token succeeds, append:

```typescript
    // The whole point of the gate now: Firebase must hold the real address, or
    // sendPasswordResetEmail has nowhere to send.
    const fbUser = await firebaseAuth.getUser(mother.firebaseUid);
    expect(fbUser.email).toBe(realEmail);
    expect(fbUser.emailVerified).toBe(true);
```

Use the file's own variable names for the mother fixture and the address it verifies; add `import { firebaseAuth } from '@backend/lib/firebase';` if it is not already imported.

- [ ] **Step 3: Run it**

```bash
pnpm --filter=@nanny-app/backend test:integration -- a14
```

Expected: PASS (Task 1 implemented the behaviour). If it fails with the placeholder address, Task 1's call is in the wrong place — fix `auth.service.ts`, not the test.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/__integration__/journeys/a14-mother-email-gate.test.ts
git commit -m "test(auth): the email gate must flip the Firebase address, not just the row

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Mobile — the SMS door replaces the phone+password door

**Files:**
- Modify: `apps/mobile/src/hooks/useAuth.ts`
- Modify: `apps/mobile/src/lib/authErrors.ts`
- Rewrite: `apps/mobile/src/screens/auth/SignInScreen.tsx` and `apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts`
- Create: `apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx`

**Interfaces:**
- Consumes: `useSendPhoneOtp` (existing), `auth()` / `PhoneConfirmation` from `@mobile/lib/firebase`, `api` from `@mobile/lib/api`.
- Produces: `useConfirmPhoneSignIn({ confirmation, code })` — resolves when the signed-in user has a backend profile; rejects with `MappedAuthError` and, on a 404, deletes the just-minted Firebase account first.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));

const mockConfirm = jest.fn();
const mockDelete = jest.fn();
const mockSignInWithPhoneNumber = jest.fn();
let currentUser: { delete: jest.Mock; email: string | null } | null = null;

jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      signInWithPhoneNumber: mockSignInWithPhoneNumber,
      get currentUser() {
        return currentUser;
      },
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

const mockGet = jest.fn();
jest.mock('@mobile/lib/api', () => ({
  api: { get: (...args: unknown[]) => mockGet(...args) },
  unwrap: async (p: Promise<{ data: { data: unknown } }>) => (await p).data.data,
  getApiErrorMessage: () => 'Something went wrong. Please try again.',
}));

import SignInScreen from '../SignInScreen';
import { renderWithProviders } from '@mobile/test-utils/render';

beforeEach(() => {
  jest.clearAllMocks();
  currentUser = { delete: mockDelete, email: 'mona@example.com' };
  mockSignInWithPhoneNumber.mockResolvedValue({ confirm: mockConfirm });
  mockConfirm.mockResolvedValue(undefined);
  mockGet.mockResolvedValue({ data: { data: { id: 1 }, error: null } });
});

it('texts a code and signs in when the number has an account', async () => {
  renderWithProviders(<SignInScreen />);

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567891');
  fireEvent.press(screen.getByText('Send code'));

  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalledWith('+201234567891', undefined));

  fireEvent.changeText(screen.getByTestId('signIn.code'), '111111');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockDelete).not.toHaveBeenCalled();
});

it('deletes the account Firebase just minted when the number has no profile', async () => {
  mockGet.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404, data: { error: 'User profile not found. Please complete registration.' } },
  });

  renderWithProviders(<SignInScreen />);

  fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567892');
  fireEvent.press(screen.getByText('Send code'));
  await waitFor(() => expect(mockSignInWithPhoneNumber).toHaveBeenCalled());

  fireEvent.changeText(screen.getByTestId('signIn.code'), '222222');
  fireEvent.press(screen.getByText('Sign in'));

  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  expect(
    screen.getByText("We couldn't find an account for that number. Sign up first."),
  ).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});
```

> Check whether `@mobile/test-utils/render` exists (`ls apps/mobile/src/test-utils` — `VerifyEmailScreen.test.tsx` shows the house pattern). If there is no such helper, wrap the screen in a `QueryClientProvider` exactly the way that test does and drop the import.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter=@nanny-app/mobile test -- SignInScreen
```

Expected: FAIL — `signIn.code` does not exist; the screen still renders a password field.

- [ ] **Step 3: Add the hook**

In `apps/mobile/src/hooks/useAuth.ts`, add `import axios from 'axios';` and replace `useSignIn` with:

```typescript
/** Signs in with the email/password credential. The secondary door. */
export function useSignInWithEmail() {
  return useMutation<
    UserCredential,
    MappedAuthError,
    { email: string; password: string }
  >({
    mutationFn: async ({ email, password }) => {
      try {
        return await auth().signInWithEmailAndPassword(email.trim().toLowerCase(), password);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}

/**
 * Finishes the default door: check the SMS code, then make sure the number
 * actually belongs to an account.
 *
 * Confirming a code *is* a sign-in, so Firebase mints a phone-only account for
 * a number it has never seen — invisible to the email door and unusable by
 * "reset password", which is how an account once looked deleted while its row
 * survived. A 404 from /auth/me is that case: delete what we just created and
 * say so, rather than leaving a stray uid squatting on the number.
 */
export function useConfirmPhoneSignIn() {
  return useMutation<void, MappedAuthError, { confirmation: PhoneConfirmation; code: string }>({
    mutationFn: async ({ confirmation, code }) => {
      try {
        await confirmation.confirm(code);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }

      const user = auth().currentUser;
      if (!user) {
        throw {
          field: 'form',
          message: 'Your code was verified but the session was lost. Please try again.',
        } satisfies MappedAuthError;
      }

      try {
        await api.get('/auth/me');
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          await user.delete();
          throw {
            field: 'phone',
            message: "We couldn't find an account for that number. Sign up first.",
          } satisfies MappedAuthError;
        }
        throw {
          field: 'form',
          message: getApiErrorMessage(error, 'Could not sign you in. Please try again.'),
        } satisfies MappedAuthError;
      }
    },
  });
}
```

Update the imports at the top of the file: `import { api, getApiErrorMessage, unwrap } from '@mobile/lib/api';`.

- [ ] **Step 4: Fix the error copy**

In `apps/mobile/src/lib/authErrors.ts`, delete the `console.error` block and its eslint-disable comment, change the wrong-password case, and make the default generic:

```typescript
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return { field: 'password', message: 'Incorrect email or password.' };
```

```typescript
    default:
      return { field: 'form', message: 'Something went wrong. Please try again.' };
```

- [ ] **Step 5: Rewrite the screen**

Replace `apps/mobile/src/screens/auth/SignInScreen.tsx` with a two-phase screen. Keep the existing decorative blobs, header and footer markup from the current file — only the form changes. The phase is driven by whether a confirmation exists, exactly as `ForgotPasswordScreen` does it:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { OTP_LENGTH, RESEND_SECONDS } from '@mobile/constants';
import { Button, OtpCodeInput } from '@mobile/components/ui';
import { useSendPhoneOtp, useConfirmPhoneSignIn } from '@mobile/hooks/useAuth';
import { validatePhone, toE164 } from '@mobile/lib/validation';
import type { PhoneConfirmation } from '@mobile/lib/firebase';
import { styles } from './styles/sign-in-screen.styles';

export default function SignInScreen() {
  const router = useRouter();
  const [countryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<PhoneConfirmation | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const sendOtp = useSendPhoneOtp();
  const confirmSignIn = useConfirmPhoneSignIn();

  const phoneE164 = toE164(countryCode, phone);
  const isCodePhase = confirmation !== null;

  const sendCode = useCallback(
    (forceResend: boolean) => {
      setFormError(null);
      setPhoneError(null);
      const phoneValidation = validatePhone(phone);
      if (phoneValidation) {
        setPhoneError(phoneValidation);
        return;
      }
      sendOtp.mutate(
        { phone: phoneE164, forceResend },
        {
          onSuccess: (result) => {
            setConfirmation(result);
            setSecondsLeft(RESEND_SECONDS);
          },
          onError: (err) => {
            if (err.field === 'phone') setPhoneError(err.message);
            else setFormError(err.message);
          },
        },
      );
    },
    // `sendOtp` is a fresh object each render; the mutation itself is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phone, phoneE164],
  );

  useEffect(() => {
    if (!isCodePhase || secondsLeft <= 0) return undefined;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [isCodePhase, secondsLeft]);

  function handleSignIn() {
    if (!confirmation) return;
    setFormError(null);
    if (code.length !== OTP_LENGTH) {
      setFormError(`Enter the ${OTP_LENGTH}-digit code we sent you.`);
      return;
    }
    confirmSignIn.mutate(
      { confirmation, code },
      {
        onSuccess: () => router.replace('/'),
        onError: (err) => {
          // A dead number sends her back to the phone field, not the code box.
          if (err.field === 'phone') {
            setConfirmation(null);
            setCode('');
            setPhoneError(err.message);
            setFormError(err.message);
          } else {
            setFormError(err.message);
          }
        },
      },
    );
  }

  const resendDisabled = secondsLeft > 0 || sendOtp.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.blobTopLeft} />
        <View style={styles.blobBottomRight} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headline}>Welcome back</Text>
            <Text style={styles.subtitle}>
              {isCodePhase
                ? `Enter the ${OTP_LENGTH}-digit code we sent to ${countryCode} ${phone}.`
                : 'Sign in to continue your childcare journey.'}
            </Text>
          </View>

          {!isCodePhase ? (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.countryCodeBox}>
                    <Text style={styles.countryCodeText}>{countryCode}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                  </View>
                  <TextInput
                    testID="signIn.phone"
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={(val: string) => {
                      setPhone(val);
                      if (phoneError) setPhoneError(null);
                      if (formError) setFormError(null);
                    }}
                    placeholder="100 000 0000"
                    placeholderTextColor={colors.textPlaceholder}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                </View>
                {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
              </View>
            </View>
          ) : (
            <View style={styles.form}>
              <OtpCodeInput
                testID="signIn.code"
                value={code}
                onChange={(val) => {
                  setCode(val);
                  if (formError) setFormError(null);
                }}
                disabled={confirmSignIn.isPending}
              />
              <View style={styles.resendRow}>
                <Text style={styles.timerText}>
                  {sendOtp.isPending ? 'Sending code…' : "Didn't get a code?"}
                </Text>
                <Pressable onPress={() => sendCode(true)} disabled={resendDisabled} hitSlop={8}>
                  <Text style={[styles.resendLink, resendDisabled && styles.resendLinkDisabled]}>
                    {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          <Button
            title={
              isCodePhase
                ? confirmSignIn.isPending
                  ? 'Signing in…'
                  : 'Sign in'
                : sendOtp.isPending
                  ? 'Sending…'
                  : 'Send code'
            }
            onPress={isCodePhase ? handleSignIn : () => sendCode(false)}
            variant="primary"
            fullWidth
            disabled={isCodePhase ? confirmSignIn.isPending : sendOtp.isPending}
          />

          <Pressable
            style={styles.altDoorRow}
            onPress={() => router.push('/(auth)/sign-in-email')}
            hitSlop={8}
          >
            <Text style={styles.altDoorLink}>Sign in with email and password instead</Text>
          </Pressable>

          <Pressable style={styles.footerRow} onPress={() => router.push('/(auth)/role-selection')}>
            <Text style={styles.footerLabel}>Don&apos;t have an account? </Text>
            <Text style={styles.footerLink}>Sign up</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
```

In `apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts`: delete `passwordMeta` / `forgotLink` (the reset door moves to the email screen), and add `resendRow`, `timerText`, `resendLink`, `resendLinkDisabled`, `altDoorRow`, `altDoorLink` — copy the first four verbatim from `styles/forgot-password-screen.styles.ts` so the two OTP panes look identical, and give `altDoorRow` `{ marginTop: spacing.lg, alignItems: 'center' }` with `altDoorLink` styled like the existing `footerLink`.

- [ ] **Step 6: Run the test to verify it passes**

```bash
pnpm --filter=@nanny-app/mobile test -- SignInScreen
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter=@nanny-app/mobile typecheck
git add apps/mobile/src/screens/auth/SignInScreen.tsx apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts apps/mobile/src/hooks/useAuth.ts apps/mobile/src/lib/authErrors.ts apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx
git commit -m "feat(mobile): sign in by phone and SMS code

The password door derived its credential from the phone number, which is why
Firebase held an address nothing could mail. The default door now signs in by
phone directly; a number with no account gets its just-minted Firebase user
deleted and a straight answer, instead of a stray uid and a silent sign-out.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Mobile — the email door

**Files:**
- Create: `apps/mobile/src/screens/auth/EmailSignInScreen.tsx`, `apps/mobile/src/screens/auth/styles/email-sign-in-screen.styles.ts`, `apps/mobile/app/(auth)/sign-in-email.tsx`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx`, `apps/mobile/src/lib/validation.ts`, `apps/mobile/src/screens/auth/VerifyEmailScreen.tsx`

**Interfaces:**
- Consumes: `useSignInWithEmail` from Task 3.
- Produces: route `/(auth)/sign-in-email`.

- [ ] **Step 1: Create the screen**

`apps/mobile/src/screens/auth/EmailSignInScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import { Button, TextInputField } from '@mobile/components/ui';
import { useSignInWithEmail } from '@mobile/hooks/useAuth';
import { validateEmail, validatePassword } from '@mobile/lib/validation';
import { styles } from './styles/email-sign-in-screen.styles';

/**
 * The secondary door. Firebase keys a password by email, so this is the only
 * place the address is a credential rather than a contact detail — and the
 * only place "Forgot password?" makes sense.
 */
export default function EmailSignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const signIn = useSignInWithEmail();

  function handleSignIn() {
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);

    const emailValidation = validateEmail(email);
    if (emailValidation) {
      setEmailError(emailValidation);
      return;
    }
    const passwordValidation = validatePassword(password);
    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    signIn.mutate(
      { email, password },
      {
        onSuccess: () => router.replace('/'),
        onError: (err) => {
          if (err.field === 'password') setPasswordError(err.message);
          else if (err.field === 'email') setEmailError(err.message);
          else setFormError(err.message);
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.headerBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headline}>Sign in with email</Text>
            <Text style={styles.subtitle}>Use the email address on your account.</Text>
          </View>

          <View style={styles.form}>
            <TextInputField
              testID="emailSignIn.email"
              label="Email"
              value={email}
              onChangeText={(val: string) => {
                setEmail(val);
                if (emailError) setEmailError(null);
                if (formError) setFormError(null);
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={emailError}
            />
            <TextInputField
              testID="emailSignIn.password"
              label="Password"
              value={password}
              onChangeText={(val: string) => {
                setPassword(val);
                if (passwordError) setPasswordError(null);
                if (formError) setFormError(null);
              }}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              error={passwordError}
            />
            <View style={styles.passwordMeta}>
              <View />
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            </View>
          </View>

          {formError && (
            <View style={styles.formErrorBanner}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          )}

          <Button
            title={signIn.isPending ? 'Signing in…' : 'Sign in'}
            onPress={handleSignIn}
            variant="primary"
            fullWidth
            disabled={signIn.isPending}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
```

Create `styles/email-sign-in-screen.styles.ts` by copying `sign-in-screen.styles.ts` and keeping only `keyboardAvoid`, `container`, `scroll`, `scrollContent`, `header`, `headline`, `subtitle`, `form`, `formErrorBanner`, `formErrorText`, plus `headerBar` / `backButton` copied verbatim from `forgot-password-screen.styles.ts` and the `passwordMeta` / `forgotLink` pair removed from the sign-in styles in Task 3.

Create `apps/mobile/app/(auth)/sign-in-email.tsx`:

```tsx
import EmailSignInScreen from '@mobile/screens/auth/EmailSignInScreen';

export default EmailSignInScreen;
```

- [ ] **Step 2: Link the real address at registration**

In `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx`, replace the two-address comment block and `credentialEmail` (around `:140-152`) with:

```tsx
    // One address now, not two. The real address proved on step 2 is both the
    // Firebase credential (so Firebase's password-reset mail can reach her)
    // and `users.email`. The phone-derived placeholder is gone.
    const profileEmail = draft.email.trim().toLowerCase();
```

and change the `confirmPhone.mutate` call to pass it:

```tsx
    confirmPhone.mutate(
      { confirmation, code: otp, email: profileEmail, password: draft.password },
```

Remove `phoneToPlaceholderEmail` from that file's imports.

- [ ] **Step 3: Delete the helper**

In `apps/mobile/src/lib/validation.ts`, delete `phoneToPlaceholderEmail` and its doc comment entirely.

- [ ] **Step 4: Refresh the cached credential after the gate**

In `apps/mobile/src/screens/auth/VerifyEmailScreen.tsx`, in `handleConfirm`, before the `invalidateQueries` call:

```tsx
    // The backend just moved the address on the Firebase account; without this
    // the client keeps serving the old one from its cached user record.
    await auth().currentUser?.reload();
```

Add `import { auth } from '@mobile/lib/firebase';`.

- [ ] **Step 5: Verify nothing still references the placeholder**

```bash
grep -rn "phoneToPlaceholderEmail" apps/mobile/src
```

Expected: no output.

- [ ] **Step 6: Typecheck, run the mobile suite, commit**

```bash
pnpm --filter=@nanny-app/mobile typecheck && pnpm --filter=@nanny-app/mobile test
```

Expected: PASS. `RegistrationStep1Screen.test.tsx` and `VerifyEmailScreen.test.tsx` may need their mocks extended for `auth().currentUser`; fix the mocks, not the screens.

```bash
git add apps/mobile/src apps/mobile/app
git commit -m "feat(mobile): add the email door and drop the placeholder credential

Registration links the address it just proved, so Firebase finally holds an
address it can mail. Sign-in by email and password moves to its own screen
behind a link, which is also the only place 'Forgot password?' belongs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Mobile — reset by email or SMS

**Files:**
- Modify: `apps/mobile/src/hooks/useAuth.ts`, `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx`, `apps/mobile/src/screens/auth/styles/forgot-password-screen.styles.ts`
- Create: `apps/mobile/src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx`

**Interfaces:**
- Consumes: `useSendPhoneOtp`, `useConfirmPhoneAndResetPassword` (existing, now guarded).
- Produces: `useSendPasswordResetEmail()` — `mutate(email)`, resolves on success and on an unknown address alike.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

const mockSendReset = jest.fn();
jest.mock('@mobile/lib/firebase', () => ({
  auth: Object.assign(
    () => ({
      sendPasswordResetEmail: mockSendReset,
      signInWithPhoneNumber: jest.fn(),
      currentUser: null,
    }),
    { EmailAuthProvider: { credential: jest.fn() } },
  ),
}));

import ForgotPasswordScreen from '../ForgotPasswordScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockSendReset.mockResolvedValue(undefined);
});

it('mails a reset link and never claims the address exists', async () => {
  render(<ForgotPasswordScreen />);

  fireEvent.press(screen.getByText('Email me a reset link'));
  fireEvent.changeText(screen.getByTestId('forgotPassword.email'), 'mona@example.com');
  fireEvent.press(screen.getByText('Send link'));

  await waitFor(() => expect(mockSendReset).toHaveBeenCalledWith('mona@example.com'));
  expect(
    screen.getByText('If an account exists for that address, the link is on its way.'),
  ).toBeTruthy();
});
```

Wrap in the same provider helper Task 3 used if the hooks need a `QueryClient`.

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter=@nanny-app/mobile test -- ForgotPasswordScreen
```

Expected: FAIL — no channel chooser.

- [ ] **Step 3: Add the hook and the SMS guard**

In `apps/mobile/src/hooks/useAuth.ts`:

```typescript
/**
 * Asks Firebase to mail its own reset link to `email`.
 *
 * Email-enumeration protection means an unknown address resolves exactly like
 * a known one, so the screen must never report delivery — the copy says "if an
 * account exists". `auth/invalid-email` is the one real error left.
 */
export function useSendPasswordResetEmail() {
  return useMutation<void, MappedAuthError, string>({
    mutationFn: async (email) => {
      try {
        await auth().sendPasswordResetEmail(email.trim().toLowerCase());
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}
```

In `useConfirmPhoneAndResetPassword`, insert the guard between the `currentUser` check and `updatePassword`:

```typescript
      if (!user.email) {
        // The confirm minted a phone-only account rather than landing on a real
        // one: this number has no account. Writing a password onto it would
        // "succeed" against a credential nothing can sign in with.
        await user.delete();
        throw {
          field: 'phone',
          message: "We couldn't find an account for that number. Sign up first.",
        } satisfies MappedAuthError;
      }
```

- [ ] **Step 4: Add the channel chooser to the screen**

In `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx`, add a `channel` state above the existing phases and render the chooser when it is unset:

```tsx
  const [channel, setChannel] = useState<'email' | 'sms' | null>(null);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const sendResetEmail = useSendPasswordResetEmail();
```

```tsx
  function handleSendResetEmail() {
    setEmailError(null);
    const emailValidation = validateEmail(email);
    if (emailValidation) {
      setEmailError(emailValidation);
      return;
    }
    sendResetEmail.mutate(email, {
      onSuccess: () => setEmailSent(true),
      onError: (err) => setEmailError(err.message),
    });
  }
```

Render, above the existing `!isVerifyPhase` branch:

```tsx
          {channel === null && (
            <View style={styles.form}>
              <Button
                title="Email me a reset link"
                onPress={() => setChannel('email')}
                variant="primary"
                fullWidth
              />
              <Button
                title="Text me a code instead"
                onPress={() => setChannel('sms')}
                variant="outline"
                fullWidth
              />
            </View>
          )}

          {channel === 'email' && !emailSent && (
            <View style={styles.form}>
              <TextInputField
                testID="forgotPassword.email"
                label="Email"
                value={email}
                onChangeText={(val: string) => {
                  setEmail(val);
                  if (emailError) setEmailError(null);
                }}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                error={emailError}
              />
              <Button
                title={sendResetEmail.isPending ? 'Sending…' : 'Send link'}
                onPress={handleSendResetEmail}
                variant="primary"
                fullWidth
                disabled={sendResetEmail.isPending}
              />
            </View>
          )}

          {channel === 'email' && emailSent && (
            <View style={styles.sentCard}>
              <Ionicons name="mail-outline" size={28} color={colors.primary} />
              <Text style={styles.sentText}>
                If an account exists for that address, the link is on its way. Open it to
                choose a new password, then sign in with your email.
              </Text>
            </View>
          )}
```

Guard the two existing phases with `channel === 'sms' && …`, and make `handleBack` step back through the chooser: if `channel !== null` and not in the verify phase, clear `channel` instead of leaving the screen. Import `validateEmail`, `TextInputField` and `useSendPasswordResetEmail`. Add `sentCard` / `sentText` to the styles file using `colors.surface`, `borderRadius.lg`, `spacing.lg` and `typeScale.body` — no new tokens.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter=@nanny-app/mobile test -- ForgotPasswordScreen
```

Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm --filter=@nanny-app/mobile typecheck
git add apps/mobile/src
git commit -m "feat(mobile): reset a password by email or by SMS

Firebase mails its own reset link now that it holds a real address; SMS stays
for anyone who cannot reach the inbox. The SMS path refuses an account with no
email on file — that account is one Firebase just minted for a number nobody
registered, and writing a password onto it only looks like it worked.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The migration script

**Files:**
- Create: `apps/backend/prisma/migrate-firebase-emails.ts`
- Modify: `apps/backend/package.json` (script entry)

**Interfaces:**
- Consumes: `prisma`, `firebaseAuth`.
- Produces: `pnpm --filter=@nanny-app/backend db:migrate-firebase-emails [--apply]`.

- [ ] **Step 1: Write the script**

```typescript
/**
 * One-off: move every live account's Firebase address to the real one.
 *
 * Accounts created before registration proved an address carry a phone-derived
 * placeholder as their Firebase credential, which is undeliverable — so
 * Firebase's password-reset mail goes nowhere. `setVerifiedEmail` converts an
 * account the first time its owner passes the verify screen; this converts the
 * ones that already hold a proven address.
 *
 * Dry-run unless --apply is passed. Never deletes, never creates.
 *
 *   pnpm db:migrate-firebase-emails
 *   pnpm db:migrate-firebase-emails --apply
 */
import { prisma } from '../src/db/prisma';
import { firebaseAuth } from '../src/lib/firebase';

const apply = process.argv.includes('--apply');

type Outcome = 'would-update' | 'updated' | 'already-correct' | 'no-firebase-account' | 'unverified' | 'failed';

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, firebaseUid: true, email: true, isEmailVerified: true },
    orderBy: { id: 'asc' },
  });

  const tally: Record<Outcome, number> = {
    'would-update': 0,
    updated: 0,
    'already-correct': 0,
    'no-firebase-account': 0,
    unverified: 0,
    failed: 0,
  };

  for (const user of users) {
    const log = (outcome: Outcome, detail = ''): void => {
      tally[outcome] += 1;
      // eslint-disable-next-line no-console
      console.log(`user ${user.id}\t${outcome}\t${detail}`);
    };

    if (!user.isEmailVerified) {
      log('unverified', 'converts itself via the verify screen');
      continue;
    }

    let current: string | undefined;
    try {
      current = (await firebaseAuth.getUser(user.firebaseUid)).email;
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found') {
        log('no-firebase-account', user.firebaseUid);
        continue;
      }
      throw err;
    }

    if (current === user.email) {
      log('already-correct');
      continue;
    }

    if (!apply) {
      log('would-update', `${current ?? '(none)'} → ${user.email}`);
      continue;
    }

    try {
      await firebaseAuth.updateUser(user.firebaseUid, {
        email: user.email,
        emailVerified: true,
      });
      log('updated', `${current ?? '(none)'} → ${user.email}`);
    } catch (err) {
      log('failed', (err as { code?: string }).code ?? String(err));
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n${apply ? 'APPLIED' : 'DRY RUN'} — ${JSON.stringify(tally)}`);
  if (tally.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the package script**

In `apps/backend/package.json`, next to `db:create-superuser`:

```json
    "db:migrate-firebase-emails": "ts-node --transpile-only -r tsconfig-paths/register prisma/migrate-firebase-emails.ts"
```

- [ ] **Step 3: Dry-run it against the test stack**

With `pnpm test:env` up and `.env.test` loaded (never against production at this point):

```bash
pnpm --filter=@nanny-app/backend db:migrate-firebase-emails
```

Expected: a line per user and a `DRY RUN — {...}` tally; no writes.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/migrate-firebase-emails.ts apps/backend/package.json
git commit -m "chore(auth): script the Firebase address migration, dry-run by default

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Emulator E2E — seeded accounts get real addresses

**Files:**
- Modify: `apps/mobile/e2e/accounts.mjs`, `apps/mobile/e2e/run.mjs`, `apps/mobile/e2e/flows/_sign-in.yaml`, `apps/backend/test/e2e/seed-mobile.ts`
- Delete: `apps/mobile/e2e/flows/c01-session-lifecycle.yaml`

**Interfaces:**
- Consumes: the Task 3/4 screens.
- Produces: `ACCOUNTS.*.email` (real addresses); `_sign-in.yaml` drives the email door.

- [ ] **Step 1: Give every fixture a real address**

In `apps/mobile/e2e/accounts.mjs`, add an `email` to each entry in `ACCOUNTS` (e.g. `mother: { …, email: 'e2e-mother@nannyapp.test' }`), delete `placeholderEmail` entirely, and update the file's header comment: the seeded Firebase credential is now the real address.

- [ ] **Step 2: Pass them through the runner**

In `apps/mobile/e2e/run.mjs`, drop the `placeholderEmail` import and change the four params to read the fixtures directly:

```javascript
    MOTHER_EMAIL: ACCOUNTS.mother.email,
    NANNY_EMAIL: ACCOUNTS.nanny.email,
    GATED_MOTHER_EMAIL: ACCOUNTS.gatedMother.email,
    PENDING_NANNY_EMAIL: ACCOUNTS.pendingNanny.email,
```

and `REGISTRATION_EMAIL: REGISTRATION.email` (the placeholder line disappears — a registering user now has one address).

- [ ] **Step 3: Seed Firebase with the real address**

In `apps/backend/test/e2e/seed-mobile.ts`, replace `placeholderEmail(spec.phone)` at both call sites (`:109` upsert, `:304` wipe) with `spec.email`, and delete the `placeholderEmail` helper (`:71-76`). The wipe's two lookups become `getUserByEmail(spec.email)` and `getUserByPhoneNumber(spec.phone)`.

- [ ] **Step 4: Point the shared sign-in subflow at the email door**

Replace `apps/mobile/e2e/flows/_sign-in.yaml` with:

```yaml
# Signs in the account whose email is ${EMAIL}.
#
# Not a test — the leading underscore keeps run.mjs from treating it as one.
# Expects `_launch.yaml` to have run: it starts from the welcome screen.
#
# Flows sign in as *setup*; the doors themselves are covered by the live-Firebase
# suite (e2e/flows/live). The email door is used here because it needs no code:
# the SMS door would have to read a verification code on every single flow.
appId: com.nannyapp.mobile
---
- tapOn: 'Get Started'

- assertVisible: 'Create your account'
- tapOn: 'Sign in'

- assertVisible: 'Welcome back'
- tapOn: 'Sign in with email and password instead'

- assertVisible: 'Sign in with email'
- tapOn:
    id: 'emailSignIn.email'
- inputText: ${EMAIL}
- hideKeyboard
- tapOn:
    id: 'emailSignIn.password'
- inputText: ${PASSWORD}
- hideKeyboard
- tapOn: 'Sign in'
```

- [ ] **Step 5: Update every caller**

```bash
grep -rn "_sign-in.yaml" -A 4 apps/mobile/e2e/flows
```

Each `runFlow` passing `PHONE: ${MOTHER_PHONE}` becomes `EMAIL: ${MOTHER_EMAIL}` (and likewise for the nanny / gated-mother / pending-nanny variants). Then delete the auth flow that the live suite replaces:

```bash
git rm apps/mobile/e2e/flows/c01-session-lifecycle.yaml
```

- [ ] **Step 6: Run one flow end to end**

With the stack, backend, emulator and Metro up per `apps/mobile/e2e/README.md`:

```bash
pnpm test:e2e:mobile smoke
```

Expected: green. If sign-in stalls on the welcome screen, the `Sign in with email and password instead` copy in the flow and the screen have drifted — match them exactly.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/e2e apps/backend/test/e2e/seed-mobile.ts
git commit -m "test(e2e): seed real addresses and sign in through the email door

The placeholder credential is gone, so the seeder writes the address the app
now links. Flows sign in as setup and use the email door, which needs no code;
the doors themselves move to the live-Firebase suite.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Backend — the live-E2E harness, allowlist first

**Files:**
- Create: `apps/backend/src/services/e2e-auth.service.ts`, `apps/backend/src/routes/e2e-auth.routes.ts`, `apps/backend/src/__tests__/e2e-auth-guard.test.ts`
- Modify: `apps/backend/src/lib/config.ts`, `apps/backend/src/routes/index.ts`, `apps/backend/package.json`

**Interfaces:**
- Consumes: `firebaseAuth`, `prisma`, `config`.
- Produces: `GET /e2e-auth/account?phone=`, `POST /e2e-auth/purge { phone }`, `POST /e2e-auth/complete-reset { email, newPassword }` — mounted only when `E2E_LIVE_AUTH_ENABLED=true`.

- [ ] **Step 1: Write the failing guard test**

`apps/backend/src/__tests__/e2e-auth-guard.test.ts`:

```typescript
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: {
    getUserByPhoneNumber: jest.fn(),
    deleteUser: jest.fn(),
    generatePasswordResetLink: jest.fn(),
  },
}));

import { firebaseAuth } from '@backend/lib/firebase';
import { describeAccount, purgeAccount, TEST_PHONES } from '@backend/services/e2e-auth.service';

const mockFb = firebaseAuth as unknown as {
  getUserByPhoneNumber: jest.Mock;
  deleteUser: jest.Mock;
};

beforeEach(() => jest.clearAllMocks());

it('allows only the two reserved numbers', () => {
  expect(TEST_PHONES).toEqual(['+201234567891', '+201234567892']);
});

it.each([
  '+201288719791', // a real person
  '+201234567890', // a manual-test account
  '+201234567893',
  '+201100000001', // an emulator fixture
])('refuses to describe %s', async (phone) => {
  await expect(describeAccount(phone)).rejects.toThrow('not a reserved test number');
  expect(mockFb.getUserByPhoneNumber).not.toHaveBeenCalled();
});

it.each(['+201288719791', '+201234567890'])('refuses to purge %s', async (phone) => {
  await expect(purgeAccount(phone)).rejects.toThrow('not a reserved test number');
  expect(mockFb.deleteUser).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter=@nanny-app/backend test:unit -- e2e-auth-guard
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

`apps/backend/src/services/e2e-auth.service.ts`:

```typescript
import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';

/**
 * The live-Firebase E2E harness.
 *
 * These operations run against the project that also serves production, so the
 * allowlist below is the whole safety story: exactly the two console test
 * numbers that carry neither a Firebase account nor a `users` row. Everything
 * else — a real customer, the manual-test accounts, the emulator fixtures — is
 * refused before a single Firebase call is made. There is deliberately no
 * "list and clean up" operation: a bug in one would be indistinguishable from
 * the incident this feature exists to prevent.
 */
export const TEST_PHONES = ['+201234567891', '+201234567892'] as const;

function assertReserved(phone: string): void {
  if (!(TEST_PHONES as readonly string[]).includes(phone)) {
    throw errors.forbidden(`${phone} is not a reserved test number.`);
  }
}

/** Refuse to run at all outside a deliberately-flagged test environment. */
function assertEnabled(): void {
  if (!config.e2eLiveAuthEnabled || config.nodeEnv === 'production') {
    throw errors.forbidden('The live-auth harness is disabled.');
  }
}

export interface AccountState {
  phone: string;
  firebaseExists: boolean;
  firebaseUid: string | null;
  firebaseEmail: string | null;
  providers: string[];
  dbRowExists: boolean;
}

/** What Firebase and the database currently hold for a reserved number. */
export async function describeAccount(phone: string): Promise<AccountState> {
  assertEnabled();
  assertReserved(phone);

  const row = await prisma.user.findUnique({ where: { phone }, select: { id: true, deletedAt: true } });

  try {
    const fb = await firebaseAuth.getUserByPhoneNumber(phone);
    return {
      phone,
      firebaseExists: true,
      firebaseUid: fb.uid,
      firebaseEmail: fb.email ?? null,
      providers: fb.providerData.map((p) => p.providerId),
      dbRowExists: row !== null && row.deletedAt === null,
    };
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      return {
        phone,
        firebaseExists: false,
        firebaseUid: null,
        firebaseEmail: null,
        providers: [],
        dbRowExists: row !== null && row.deletedAt === null,
      };
    }
    throw err;
  }
}

/**
 * Returns a reserved number to "never registered": the Firebase account goes,
 * and the row is soft-deleted with its unique columns tagged so the next run
 * can register the same number again.
 */
export async function purgeAccount(phone: string): Promise<AccountState> {
  assertEnabled();
  assertReserved(phone);

  const before = await describeAccount(phone);
  if (before.firebaseUid) {
    await firebaseAuth.deleteUser(before.firebaseUid);
  }

  const row = await prisma.user.findUnique({ where: { phone } });
  if (row && !row.deletedAt) {
    const tag = `wiped-${row.id}-`;
    await prisma.user.update({
      where: { id: row.id },
      data: {
        deletedAt: new Date(),
        phone: `${tag}${row.phone}`,
        email: `${tag}${row.email}`,
        firebaseUid: `${tag}${row.firebaseUid}`,
        referralCode: null,
      },
    });
  }

  return describeAccount(phone);
}

/**
 * Completes a password reset the way the hosted page would: mint the oobCode
 * with the Admin SDK, then spend it over the Identity Toolkit REST API. This
 * is the half of the email flow that happens outside the app.
 */
export async function completeReset(email: string, newPassword: string): Promise<void> {
  assertEnabled();

  const row = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { phone: true },
  });
  assertReserved(row?.phone ?? '');

  const link = await firebaseAuth.generatePasswordResetLink(email);
  const oobCode = new URL(link).searchParams.get('oobCode');
  if (!oobCode) throw errors.badRequest('Firebase returned a link with no oobCode.');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${config.firebase.webApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode, newPassword }),
    },
  );
  if (!res.ok) {
    throw errors.badRequest(`resetPassword → ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 4: Add the config keys**

In `apps/backend/src/lib/config.ts`, add to the schema, following the `QA_CHECKLIST_ENABLED` pattern:

```typescript
  // The live-Firebase E2E harness. Off unless explicitly turned on: its
  // endpoints are unauthenticated and they delete Firebase accounts.
  E2E_LIVE_AUTH_ENABLED: z
    .string()
    .optional()
    .transform((v) => v?.trim().toLowerCase() === 'true'),
  // Web API key of the Firebase project, used only to spend an oobCode over
  // the Identity Toolkit REST API from the harness.
  FIREBASE_WEB_API_KEY: z.string().optional(),
```

and to the exported object: `e2eLiveAuthEnabled: raw.E2E_LIVE_AUTH_ENABLED,` plus `webApiKey: raw.FIREBASE_WEB_API_KEY ?? ''` inside the existing `firebase: { … }` block.

- [ ] **Step 5: Write the router and mount it**

`apps/backend/src/routes/e2e-auth.routes.ts`:

```typescript
import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { completeReset, describeAccount, purgeAccount } from '@backend/services/e2e-auth.service';

/**
 * Live-Firebase E2E harness. Mounted only when E2E_LIVE_AUTH_ENABLED is set —
 * never in production — and every operation is allowlisted to the two reserved
 * test numbers inside the service. See e2e-auth.service.ts.
 */
export const e2eAuthRouter = Router();

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw errors.badRequest(`${name} is required.`);
  }
  return value.trim();
}

e2eAuthRouter.get('/account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await describeAccount(requiredString(req.query['phone'], 'phone'))));
  } catch (err) {
    next(err);
  }
});

e2eAuthRouter.post('/purge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await purgeAccount(requiredString(req.body?.phone, 'phone'))));
  } catch (err) {
    next(err);
  }
});

e2eAuthRouter.post('/complete-reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await completeReset(
      requiredString(req.body?.email, 'email'),
      requiredString(req.body?.newPassword, 'newPassword'),
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
```

In `apps/backend/src/routes/index.ts`, beside the QA mount:

```typescript
// Unauthenticated and destructive by design — see e2e-auth.routes.ts. Mounted
// only when the flag is set, and never in production.
if (config.e2eLiveAuthEnabled && config.nodeEnv !== 'production') {
  apiRouter.use('/e2e-auth', e2eAuthRouter);
}
```

- [ ] **Step 6: Run the guard test**

```bash
pnpm --filter=@nanny-app/backend test:unit -- e2e-auth-guard
```

Expected: PASS, 8 assertions. The mock must set `config.e2eLiveAuthEnabled` true — add `jest.mock('@backend/lib/config', () => ({ config: { e2eLiveAuthEnabled: true, nodeEnv: 'test', firebase: { webApiKey: 'k' } } }))` if the test fails on the enable check rather than the allowlist.

- [ ] **Step 7: Add the live backend profile**

In `apps/backend/package.json`, beside `start:test`:

```json
    "start:test:live-auth": "cross-env E2E_LIVE_AUTH_ENABLED=true FIREBASE_AUTH_EMULATOR_HOST= ts-node --transpile-only -r tsconfig-paths/register -r ./test/env.ts src/server.ts"
```

Check whether `cross-env` is already a devDependency (`grep cross-env apps/backend/package.json`); if not, use the shell form the other scripts use. The service-account credentials come from `apps/backend/.env`; `FIREBASE_AUTH_EMULATOR_HOST` must be empty so the Admin SDK talks to the real project while `test/env.ts` keeps the database on `nannyapp_test`.

- [ ] **Step 8: Typecheck and commit**

```bash
pnpm --filter=@nanny-app/backend typecheck && pnpm --filter=@nanny-app/backend test:unit
git add apps/backend/src apps/backend/package.json
git commit -m "test(e2e): a live-Firebase harness that can only touch two numbers

Validating the auth doors means driving the real project, so the harness is
allowlisted to the two console test numbers that carry neither a Firebase
account nor a row — and has no list-and-clean operation at all, because a bug
in one would look exactly like the incident this feature exists to prevent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Live E2E — the five flows

**Files:**
- Create: `apps/mobile/e2e/live.mjs`, `apps/mobile/e2e/flows/live/sign-in-sms.yaml`, `sign-in-email.yaml`, `sign-in-sms-no-account.yaml`, `reset-sms.yaml`, `reset-email.yaml`
- Modify: `apps/mobile/e2e/scripts/advance.js`, `apps/mobile/e2e/README.md`

**Interfaces:**
- Consumes: Task 8's `/e2e-auth/*` endpoints; the Task 3–5 screens.
- Produces: `node e2e/live.mjs [flow]`.

- [ ] **Step 1: Add the harness advance steps**

In `apps/mobile/e2e/scripts/advance.js`, add three steps next to `phoneOtp`, following that file's existing `http`/`json`/`output` style:

```javascript
/**
 * Asserts the reserved number has no Firebase account left behind.
 *
 *   - runScript:
 *       file: ../scripts/advance.js
 *       env:
 *         ADVANCE: live-assert-no-account
 *         LIVE_PHONE: '+201234567892'
 */
function liveAssertNoAccount() {
  var res = http.get(BACKEND_URL + '/e2e-auth/account?phone=' + encodeURIComponent(LIVE_PHONE));
  if (res.status < 200 || res.status >= 300) {
    throw new Error('GET /e2e-auth/account → ' + res.status + ' ' + res.body);
  }
  var state = json(res.body).data;
  if (state.firebaseExists) {
    throw new Error('A Firebase account was left behind for ' + LIVE_PHONE + ': ' + res.body);
  }
  output.firebaseExists = 'false';
}

/** Returns a reserved number to "never registered". */
function livePurge() {
  var res = http.post(BACKEND_URL + '/e2e-auth/purge', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: LIVE_PHONE }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error('POST /e2e-auth/purge → ' + res.status + ' ' + res.body);
  }
}

/**
 * Does what Firebase's hosted reset page does: mint the oobCode and spend it.
 * The app's half ends at "check your email"; this is the other half.
 */
function liveCompleteReset() {
  var res = http.post(BACKEND_URL + '/e2e-auth/complete-reset', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LIVE_EMAIL, newPassword: LIVE_NEW_PASSWORD }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error('POST /e2e-auth/complete-reset → ' + res.status + ' ' + res.body);
  }
}
```

Read `LIVE_PHONE`, `LIVE_EMAIL` and `LIVE_NEW_PASSWORD` from the environment beside the file's existing `OTP_PHONE` declaration, and register the three steps in `STEPS`.

- [ ] **Step 2: Write the runner**

`apps/mobile/e2e/live.mjs` — model it on `run.mjs` (same Maestro invocation, same `quoteArg`, same env passthrough) but with:

```javascript
/**
 * The live-Firebase auth suite.
 *
 * Everything else runs against the Auth emulator; these five flows must not,
 * because what they check is how the real project behaves — phone sign-in, the
 * password credential, and Firebase's own reset mail. The numbers below are the
 * two console test numbers reserved for automation: their codes are fixed, no
 * SMS is sent, and the backend harness refuses every other number.
 *
 *   node e2e/live.mjs              # all five
 *   node e2e/live.mjs reset-email  # one
 *
 * Requires: backend started with `pnpm --filter=@nanny-app/backend start:test:live-auth`,
 * and an app build made WITHOUT FIREBASE_AUTH_EMULATOR_HOST.
 */
export const LIVE = {
  /** The managed account: created, signed into, reset and purged each run. */
  managed: {
    phone: '+201234567891',
    code: '111111',
    email: 'markbotros0+e2e1@gmail.com',
    password: 'E2ePassw0rd!',
    newPassword: 'E2eNewPassw0rd!',
    firstName: 'Mona',
  },
  /** Deliberately never registered: drives the orphan guard. */
  absent: {
    phone: '+201234567892',
    code: '222222',
  },
};
```

Before the flows run, POST `/e2e-auth/purge` for **both** numbers, then register the managed account by driving the registration wizard once (reuse `flows/c02-mother-registration.yaml` with the live params) or by calling the backend directly if a seeding endpoint proves simpler. After the flows, purge both numbers again — a failed run must not leave state behind.

Pass these params to every flow: `MANAGED_PHONE` (local digits), `MANAGED_PHONE_E164`, `MANAGED_CODE`, `MANAGED_EMAIL`, `MANAGED_PASSWORD`, `MANAGED_NEW_PASSWORD`, `ABSENT_PHONE`, `ABSENT_PHONE_E164`, `ABSENT_CODE`, `BACKEND_URL`.

- [ ] **Step 3: Write `flows/live/sign-in-sms.yaml`**

```yaml
# The default door, against the real project.
#
# The code is fixed in the Firebase console for this number, so nothing is sent
# and nothing has to be read back — which is the whole reason these two numbers
# are reserved.
appId: com.nannyapp.mobile
---
- runFlow: ../_launch.yaml

- tapOn: 'Get Started'
- assertVisible: 'Create your account'
- tapOn: 'Sign in'
- assertVisible: 'Welcome back'

- tapOn:
    id: 'signIn.phone'
- inputText: ${MANAGED_PHONE}
- hideKeyboard
- tapOn: 'Send code'

- extendedWaitUntil:
    visible: "Didn't get a code?"
    timeout: 60000

- tapOn:
    id: 'signIn.code.boxes'
- inputText: ${MANAGED_CODE}
- hideKeyboard
- tapOn: 'Sign in'

- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000
```

> `OtpCodeInput` puts the bare `testID` on the offscreen input and `${testID}.boxes` on the visible boxes (`otp-code-input.tsx:43,62`) — so a flow taps `signIn.code.boxes` to focus, while a unit test drives `signIn.code` directly.

- [ ] **Step 4: Write `flows/live/sign-in-email.yaml`**

```yaml
# The secondary door: the real address is the Firebase credential now, so this
# is the assertion that registration linked the right one.
appId: com.nannyapp.mobile
---
- runFlow: ../_launch.yaml
- runFlow:
    file: ../_sign-in.yaml
    env:
      EMAIL: ${MANAGED_EMAIL}
      PASSWORD: ${MANAGED_PASSWORD}
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000
```

- [ ] **Step 5: Write `flows/live/sign-in-sms-no-account.yaml`**

```yaml
# The orphan guard — the failure that made an account look deleted.
#
# Confirming a code *is* a sign-in, so Firebase mints a phone-only account for a
# number nobody registered. The app must delete it and say so; the assertion
# that matters is the harness one at the end, because a stray account is exactly
# what a screen cannot show you.
appId: com.nannyapp.mobile
---
- runFlow: ../_launch.yaml

- tapOn: 'Get Started'
- assertVisible: 'Create your account'
- tapOn: 'Sign in'
- assertVisible: 'Welcome back'

- tapOn:
    id: 'signIn.phone'
- inputText: ${ABSENT_PHONE}
- hideKeyboard
- tapOn: 'Send code'

- extendedWaitUntil:
    visible: "Didn't get a code?"
    timeout: 60000

- tapOn:
    id: 'signIn.code.boxes'
- inputText: ${ABSENT_CODE}
- hideKeyboard
- tapOn: 'Sign in'

- extendedWaitUntil:
    visible: "We couldn't find an account for that number. Sign up first."
    timeout: 60000
- assertNotVisible: 'Book care'

# Nothing may be left squatting on the number.
- runScript:
    file: ../../scripts/advance.js
    env:
      ADVANCE: live-assert-no-account
      LIVE_PHONE: ${ABSENT_PHONE_E164}
- assertTrue: ${output.firebaseExists == 'false'}
```

- [ ] **Step 6: Write `flows/live/reset-sms.yaml`**

```yaml
# Reset by SMS, proven by signing in with the new password afterwards —
# landing back in the app is client state the SDK reports on any success.
appId: com.nannyapp.mobile
---
- runFlow: ../_launch.yaml

- tapOn: 'Get Started'
- assertVisible: 'Create your account'
- tapOn: 'Sign in'
- assertVisible: 'Welcome back'
- tapOn: 'Sign in with email and password instead'
- assertVisible: 'Sign in with email'
- tapOn: 'Forgot password?'
- extendedWaitUntil:
    visible: 'Reset your password'
    timeout: 30000

- tapOn: 'Text me a code instead'
- tapOn:
    id: 'forgotPassword.phone'
- inputText: ${MANAGED_PHONE}
- hideKeyboard
- tapOn: 'Send code'

- extendedWaitUntil:
    visible: 'New password'
    timeout: 30000

- tapOn:
    id: 'forgotPassword.code.boxes'
- inputText: ${MANAGED_CODE}
- hideKeyboard
- tapOn: 'Enter a new password'
- inputText: ${MANAGED_NEW_PASSWORD}
- hideKeyboard
- tapOn: 'Re-enter your password'
- inputText: ${MANAGED_NEW_PASSWORD}
- hideKeyboard
- tapOn: 'Reset password'

- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000

# The proof: sign out, then in again with the new password.
- tapOn: 'Account'
- extendedWaitUntil:
    visible: 'Sign out'
    timeout: 30000
- tapOn: 'Sign out'
- extendedWaitUntil:
    visible: 'Care you can trust'
    timeout: 30000

- runFlow:
    file: ../_sign-in.yaml
    env:
      EMAIL: ${MANAGED_EMAIL}
      PASSWORD: ${MANAGED_NEW_PASSWORD}
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000
```

> This flow leaves the managed account on `MANAGED_NEW_PASSWORD`. `live.mjs` purges and re-registers between flows, so ordering does not matter — but if you make the suite share one registration, run this flow last.

- [ ] **Step 7: Write `flows/live/reset-email.yaml`**

```yaml
# Reset by email. The app's half ends at "check your email"; the rest happens on
# Firebase's hosted page, which a device cannot drive — so the harness mints the
# oobCode and spends it exactly as that page would, and the flow then proves the
# password really changed by signing in with the new one.
appId: com.nannyapp.mobile
---
- runFlow: ../_launch.yaml

- tapOn: 'Get Started'
- assertVisible: 'Create your account'
- tapOn: 'Sign in'
- assertVisible: 'Welcome back'
- tapOn: 'Sign in with email and password instead'
- assertVisible: 'Sign in with email'
- tapOn: 'Forgot password?'
- extendedWaitUntil:
    visible: 'Reset your password'
    timeout: 30000

- tapOn: 'Email me a reset link'
- tapOn:
    id: 'forgotPassword.email'
- inputText: ${MANAGED_EMAIL}
- hideKeyboard
- tapOn: 'Send link'

# Deliberately non-committal copy: Firebase answers the same for an address it
# has never seen, so the screen must not claim delivery.
- extendedWaitUntil:
    visible: 'If an account exists for that address, the link is on its way.'
    timeout: 60000

- runScript:
    file: ../../scripts/advance.js
    env:
      ADVANCE: live-complete-reset
      LIVE_EMAIL: ${MANAGED_EMAIL}
      LIVE_NEW_PASSWORD: ${MANAGED_NEW_PASSWORD}

- runFlow: ../_launch.yaml
- runFlow:
    file: ../_sign-in.yaml
    env:
      EMAIL: ${MANAGED_EMAIL}
      PASSWORD: ${MANAGED_NEW_PASSWORD}
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000
```

- [ ] **Step 8: Run the suite**

```bash
pnpm --filter=@nanny-app/backend start:test:live-auth
```

then, with the emulator and Metro up and an app build made without `FIREBASE_AUTH_EMULATOR_HOST`:

```bash
cd apps/mobile && node e2e/live.mjs
```

Expected: five flows green. Then confirm the harness cleaned up:

```bash
curl "http://localhost:3001/e2e-auth/account?phone=%2B201234567891"
curl "http://localhost:3001/e2e-auth/account?phone=%2B201234567892"
```

Expected: `firebaseExists: false` for both.

- [ ] **Step 9: Document it**

Add a "Live-Firebase auth suite" section to `apps/mobile/e2e/README.md`: what it covers, the two reserved numbers and their fixed codes, the two processes it needs, the build difference, and the rule that no other number may ever be added to the allowlist.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/e2e
git commit -m "test(e2e): cover both sign-in doors and both reset channels live

Against the real project, not the emulator: what these check is how Firebase
itself behaves — phone sign-in, the password credential, and its own reset
mail. The no-account flow asserts through the harness that nothing was left
squatting on the number, which is the part a screen cannot show you.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Manual validation and rollout

**Files:** none — this is the gate before deploying.

- [ ] **Step 1: Walk the manual matrix**

On a real build (TestFlight for iOS, a debug APK for Android), record the result of each:

| # | Check | Pass = |
|---|---|---|
| 1 | Sign in by SMS with a real, non-test number | a real SMS arrives; the code signs in |
| 2 | Reset by email to a real inbox | Firebase's mail arrives; the link opens; the new password works on the email door |
| 3 | iOS TestFlight, phone sign-in | no reCAPTCHA fallback, or it completes cleanly if it appears |
| 4 | Legacy migration | sign in by SMS on an account still holding a placeholder → verify screen → its Firebase address is now the real one |

Check 4 can be confirmed with the read-only lookup pattern in `MEMORY.md` → *Prod account diagnostics*.

- [ ] **Step 2: Ship the mobile change**

EAS Update OTA — the whole mobile change is JS-only, so installed builds pick it up. Its default door is SMS, which does not depend on the credential address.

- [ ] **Step 3: Deploy the backend**

Merge to `main`; `deploy-backend.yml` handles the rest. Confirm `E2E_LIVE_AUTH_ENABLED` is **not** set in the production task definition.

- [ ] **Step 4: Migrate the remaining accounts**

```bash
pnpm --filter=@nanny-app/backend db:migrate-firebase-emails
```

Read the tally. Then, only if it looks right:

```bash
pnpm --filter=@nanny-app/backend db:migrate-firebase-emails -- --apply
```

- [ ] **Step 5: Customise the Firebase reset template**

Firebase Console → Authentication → Templates → Password reset: sender name, subject and reply-to. A verified custom sender domain is optional and can come later.

---

## Self-Review

**Spec coverage:** identity model → Tasks 1, 3, 4; screens → 3, 4, 5; backend → 1, 2; migration → 6, 10; edge cases → 3 (sign-in guard), 5 (reset guard), 4 (`reload`), 3 (error copy); emulator tests → 1, 2, 3, 5, 7; live tests → 8, 9; manual matrix and rollout → 10. No section without a task.

**Known ambiguities left to the implementer, deliberately:** the exact `registerUser` transaction mock (Task 1 Step 1), whether a shared render helper exists for mobile tests (Task 3 Step 1), `OtpCodeInput`'s testID suffix (Task 9 Step 3), and how `live.mjs` seeds the managed account (Task 9 Step 2). Each names the file to read and the rule to follow.
