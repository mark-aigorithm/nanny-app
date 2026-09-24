# Sign-in Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sign-in the app's front door, with phone, Google/Apple, "Sign in with email", "Forgot password?", "Sign up" and "Continue as guest". Give Google/Apple users a clear route to a password.

**Architecture:** Most of the pieces already exist; this plan rewires them:
- `SignInScreen` gains the email button, the forgot link, the sign-up button and the guest link.
- The "Get Started" splash is deleted, and the root gate redirects to sign-in.
- Screens that send people back to sign-in use `router.dismissTo`, so sign-in never stacks twice.
- The email screen and the Forgot-password screen explain how a Google/Apple user gets a password.
- Backend integration tests on the Auth emulator prove that the password is actually created.

**Tech Stack:** Expo 54, expo-router 6.0.24, React Native Testing Library + jest-expo, Maestro, Express backend with Jest integration tests on the Firebase Auth emulator.

**Spec:** `Docs/superpowers/specs/2026-09-24-registration-hardening-design.md` ("Plan 1 detail").

## Global Constraints

- **Branch:** `feat/sign-in-landing`. Check `git branch --show-current` before the first commit.
- **Commits:** stage files by name, never `git add -A` or `git add .`. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **TypeScript:** strict, with no `any`. Use `import type` for types.
- **Copy (verbatim):**
  - Header: `Welcome to NannyNow`, built as `` `Welcome to ${APP_NAME}` `` with `APP_NAME` from `@mobile/constants`.
  - Email button: `Sign in with email`.
  - Forgot link: `Forgot password?`.
  - Divider label: `New to NannyNow?`, built as `` `New to ${APP_NAME}?` ``.
  - Sign-up button: `Sign up`.
  - Guest link: `Continue as guest`.
  - Email-screen hint: `Signed up with Google or Apple? Use that button, or tap Forgot password to create a password.`
  - Forgot-password hint: `Signed up with Google or Apple? This also creates a password for your account.`
- **Back-navigation:** use `router.dismissTo('/(auth)/sign-in')` wherever the plan says so. `RegisterPromptModal` and `VerifyEmailScreen:53` stay unchanged.
- **Tests and environment:**
  - Backend integration tests run only against the local test stack (`pnpm test:env`). Never load `apps/backend/.env`; it points at live production.
  - Mobile unit tests run from `apps/mobile`: `pnpm exec jest <path>`.
- **Style:** match the surrounding code's comment density and idiom. Comments explain *why*.

---

### Task 1: Sign-in screen as the front door

**Files:**
- Modify: `apps/mobile/src/screens/auth/SignInScreen.tsx`
- Modify: `apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts`
- Test: `apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx`

**Interfaces:**
- Consumes: `useGuestStore.getState().enterGuestMode()` (`@mobile/store/guestStore`), `APP_NAME` (`@mobile/constants`), `Button` and `Divider` (`@mobile/components/ui`), and `fromE164`, which is already imported.
- Produces: the visible copy listed in Global Constraints. E2E flows (Task 4) select on these exact strings.

- [ ] **Step 1: Make the router mock observable.** In `SignInScreen.test.tsx`, replace the `expo-router` mock at the top with:

```tsx
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));
```

Also add the guest store import after the `usePendingLinkStore` import:

```tsx
import { useGuestStore } from '@mobile/store/guestStore';
```

In `beforeEach`, add `useGuestStore.setState({ isGuest: false });`.

- [ ] **Step 2: Write the failing tests.** Append to `SignInScreen.test.tsx`:

```tsx
describe('the front door', () => {
  it('welcomes by the app name', () => {
    renderScreen();
    expect(screen.getByText('Welcome to NannyNow')).toBeTruthy();
  });

  it('opens the email door from its button', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Sign in with email'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/sign-in-email');
  });

  it('opens password reset from "Forgot password?"', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('opens sign-up from "Sign up"', () => {
    renderScreen();
    expect(screen.getByText('New to NannyNow?')).toBeTruthy();
    fireEvent.press(screen.getByText('Sign up'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/role-selection');
  });

  it('lets a visitor browse as a guest', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Continue as guest'));
    expect(useGuestStore.getState().isGuest).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/(parent)/home');
  });

  it('hides the guest link while a Google connection is waiting to be linked', () => {
    usePendingLinkStore.getState().set(PENDING_GOOGLE);
    renderScreen();
    expect(screen.queryByText('Continue as guest')).toBeNull();
  });

  it('shows only the code UI once a code is on its way', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('signIn.phone'), '1234567891');
    fireEvent.press(screen.getByText('Send code'));
    await waitFor(() => expect(screen.getByTestId('signIn.code')).toBeTruthy());
    expect(screen.queryByText('Sign in with email')).toBeNull();
    expect(screen.queryByText('Forgot password?')).toBeNull();
    expect(screen.queryByText('Sign up')).toBeNull();
    expect(screen.queryByText('Continue as guest')).toBeNull();
  });

  it('prefills the number when a connection is parked after the screen mounted', () => {
    renderScreen();
    act(() => {
      usePendingLinkStore.getState().set(PENDING_GOOGLE);
    });
    expect(screen.getByTestId('signIn.phone').props.value).toBe('1234567891');
  });
});
```

Add `act` to the `@testing-library/react-native` import. `PENDING_GOOGLE` is the fixture this test file already defines (phoneHint `+201234567891`); reuse it. If its phoneHint differs, change the expected digits in the prefill test to match.

- [ ] **Step 3: Run the tests and watch them fail.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/SignInScreen.test.tsx`
Expected: the new "front door" tests FAIL (text not found); the existing tests pass.

- [ ] **Step 4: Implement.** In `SignInScreen.tsx`:

  1. Add these imports:
     ```tsx
     import { APP_NAME } from '@mobile/constants';
     import { useGuestStore } from '@mobile/store/guestStore';
     ```
     If `OTP_LENGTH` and `RESEND_SECONDS` already come from `@mobile/constants`, merge `APP_NAME` into that import.

  2. After the `phone` state, add the prefill effect:
     ```tsx
     // Sign-in now sits under the sign-up screen, so a collision found there
     // comes back to this screen already mounted — the initializer above has
     // run. Carry the number she typed across when the connection is parked.
     const phoneHint = pending?.phoneHint ?? null;
     useEffect(() => {
       if (phoneHint) setPhone(fromE164('+20', phoneHint));
     }, [phoneHint]);
     ```

  3. Change the headline to `<Text style={styles.headline}>{`Welcome to ${APP_NAME}`}</Text>`.

  4. Replace everything from `{!isCodePhase && (<View style={styles.socialSection}>` down to the closing `</Pressable>` of the "Don't have an account?" footer with:
     ```tsx
     {!isCodePhase && (
       <>
         <View style={styles.socialSection}>
           <Divider label="or" />
           <SocialAuthButtons context="sign-in" />
           <Button
             title="Sign in with email"
             icon="mail-outline"
             onPress={() => router.push('/(auth)/sign-in-email')}
             variant="outline"
             fullWidth
           />
         </View>

         <Pressable
           style={styles.forgotRow}
           onPress={() => router.push('/(auth)/forgot-password')}
           hitSlop={8}
         >
           <Text style={styles.forgotLink}>Forgot password?</Text>
         </Pressable>

         <View style={styles.signUpSection}>
           <Divider label={`New to ${APP_NAME}?`} />
           <Button
             title="Sign up"
             onPress={() => router.push('/(auth)/role-selection')}
             variant="outline"
             fullWidth
           />
         </View>

         {/* A pending connection means she has an account to finish signing
             in to — browsing as a guest would quietly drop it. */}
         {!pending && (
           <Pressable
             style={styles.guestRow}
             onPress={() => {
               useGuestStore.getState().enterGuestMode();
               router.replace('/(parent)/home');
             }}
             hitSlop={8}
           >
             <Text style={styles.guestLink}>Continue as guest</Text>
           </Pressable>
         )}
       </>
     )}
     ```
     If `Button` has no `icon` prop typed as an Ionicons name, drop `icon`; `SocialAuthButtons` shows how `icon` is passed.

- [ ] **Step 5: Styles.** In `sign-in-screen.styles.ts`, delete `altDoorRow`, `altDoorLink`, `footerRow`, `footerLabel` and `footerLink`, and add:

```ts
  // "Forgot password?" — reset works for every door, so it sits on this one
  forgotRow: {
    alignItems: 'center',
  },
  forgotLink: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },

  // "New to NannyNow?" + Sign up
  signUpSection: {
    gap: spacing.md,
  },

  // Guest browsing — deliberately quieter than every sign-in route above it
  guestRow: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  guestLink: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textSecondary,
  },
```

Also check that `socialSection` has a `gap`, so the email button spaces like the social buttons.

- [ ] **Step 6: Run the tests and watch them pass.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/SignInScreen.test.tsx`
Expected: all PASS.

- [ ] **Step 7: Typecheck.**

Run: `cd apps/mobile && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit.**

```bash
git add apps/mobile/src/screens/auth/SignInScreen.tsx apps/mobile/src/screens/auth/styles/sign-in-screen.styles.ts apps/mobile/src/screens/auth/__tests__/SignInScreen.test.tsx
git commit -m "feat(auth): sign-in becomes the front door

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Route the app through sign-in and drop the splash

**Files:**
- Modify: `apps/mobile/app/index.tsx:40`
- Modify: `apps/mobile/src/screens/auth/PendingReviewScreen.tsx:70`
- Modify: `apps/mobile/src/screens/auth/UploadIdScreen.tsx:96`
- Modify: `apps/mobile/src/screens/auth/VerifyEmailScreen.tsx:134` (line 134 only; line 53 stays)
- Modify: `apps/mobile/src/screens/nanny/NannyProfileEditScreen.tsx:231`
- Modify: `apps/mobile/src/screens/auth/RoleSelectionScreen.tsx:45-47`
- Modify: `apps/mobile/src/components/SocialAuthButtons.tsx:74`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx:199`
- Modify: `apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx:223`
- Modify: `apps/mobile/src/store/guestStore.ts` (comments only)
- Delete: `apps/mobile/app/(auth)/splash.tsx`, `apps/mobile/src/screens/auth/SplashScreen.tsx`, `apps/mobile/src/screens/auth/styles/splash-screen.styles.ts`
- Test: `RoleSelectionScreen.test.tsx`, `SocialAuthButtons.test.tsx`, `RegistrationStep1Screen.test.tsx`, `RegistrationStep3Screen.test.tsx` (all under `apps/mobile/src/**/__tests__/`)

**Interfaces:**
- Consumes: `router.dismissTo(href)` from expo-router 6. It pops to `href` if that screen is in the stack, and otherwise replaces the current screen with it.
- Produces: nothing new.

- [ ] **Step 1: Update the tests first.**
  - **Mocks.** In each of the four test files, add `dismissTo: mockDismissTo` to the `useRouter` mock and declare `const mockDismissTo = jest.fn();` next to the other router mocks.
  - **`SocialAuthButtons.test.tsx:108`:** change the expectation to `expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in')`. At line 117, also assert `expect(mockDismissTo).not.toHaveBeenCalled()` next to the existing `mockPush` assertion.
  - **`RegistrationStep1Screen.test.tsx:217,242` and `RegistrationStep3Screen.test.tsx:118,147`:** change `expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in')` to `expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in')`.
  - **`RoleSelectionScreen.test.tsx`:** add this test:

```tsx
it('goes back to sign-in rather than stacking a second copy', async () => {
  const { getByText } = await renderScreen();
  fireEvent.press(getByText('Sign in'));
  expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in');
  expect(mockPush).not.toHaveBeenCalledWith('/(auth)/sign-in');
});
```

`renderScreen` returns the render result. If the file destructures differently, follow its pattern.

- [ ] **Step 2: Run the tests and watch them fail.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/RoleSelectionScreen.test.tsx src/components/__tests__/SocialAuthButtons.test.tsx src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx`
Expected: the six changed or added assertions FAIL.

- [ ] **Step 3: Implement the navigation changes.**
  - `RoleSelectionScreen.tsx`: the body of `handleSignIn` becomes `router.dismissTo('/(auth)/sign-in');`. Add a comment above it: `// Sign-in is the front door, so it is already underneath — go back to it.`
  - `SocialAuthButtons.tsx:74`: `if (context === 'sign-up') router.dismissTo('/(auth)/sign-in');`
  - `RegistrationStep1Screen.tsx:199` and `RegistrationStep3Screen.tsx:223`: `router.replace('/(auth)/sign-in')` becomes `router.dismissTo('/(auth)/sign-in')`.
  - `app/index.tsx:40`: `: <Redirect href="/(auth)/sign-in" />;`. Update the comment above it: "No Firebase user: guests browse the read-only parent experience, everyone else lands on sign-in."
  - `PendingReviewScreen.tsx:70`, `UploadIdScreen.tsx:96`, `VerifyEmailScreen.tsx:134` and `NannyProfileEditScreen.tsx:231`: `'/(auth)/splash'` becomes `'/(auth)/sign-in'`.
  - `guestStore.ts`: reword the comments that mention "the splash screen". Guest mode is entered from the "Continue as guest" link on sign-in, and each cold start lands on sign-in again.

- [ ] **Step 4: Delete the splash.**

```bash
git rm "apps/mobile/app/(auth)/splash.tsx" apps/mobile/src/screens/auth/SplashScreen.tsx apps/mobile/src/screens/auth/styles/splash-screen.styles.ts
```

Then confirm nothing else references them:

Run: `cd apps/mobile && grep -rn "splash-screen.styles\|screens/auth/SplashScreen\|(auth)/splash" src app`
Expected: no output. `expo-splash-screen` in `app/_layout.tsx` is the native splash and stays.

- [ ] **Step 5: Run the tests and watch them pass.**

Run: `cd apps/mobile && pnpm exec jest`
Expected: all suites PASS, with no count lower than before apart from deleted tests.

- [ ] **Step 6: Typecheck.**

Run: `cd apps/mobile && pnpm typecheck`
Expected: exit 0. If expo-router's typed routes still list `/(auth)/splash` in a generated file (`.expo/types`), regenerate it or confirm it is git-ignored.

- [ ] **Step 7: Commit.**

```bash
git add apps/mobile/app/index.tsx apps/mobile/src/screens/auth/PendingReviewScreen.tsx apps/mobile/src/screens/auth/UploadIdScreen.tsx apps/mobile/src/screens/auth/VerifyEmailScreen.tsx apps/mobile/src/screens/nanny/NannyProfileEditScreen.tsx apps/mobile/src/screens/auth/RoleSelectionScreen.tsx apps/mobile/src/components/SocialAuthButtons.tsx apps/mobile/src/screens/auth/RegistrationStep1Screen.tsx apps/mobile/src/screens/auth/RegistrationStep3Screen.tsx apps/mobile/src/store/guestStore.ts apps/mobile/src/screens/auth/__tests__/RoleSelectionScreen.test.tsx apps/mobile/src/components/__tests__/SocialAuthButtons.test.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep1Screen.test.tsx apps/mobile/src/screens/auth/__tests__/RegistrationStep3Screen.test.tsx
git commit -m "feat(auth): land on sign-in and retire the Get Started splash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The `git rm` in Step 4 already staged the deletions.)

---

### Task 3: A password for Google and Apple users

**Files:**
- Modify: `apps/mobile/src/screens/auth/EmailSignInScreen.tsx`
- Modify: `apps/mobile/src/screens/auth/styles/email-sign-in-screen.styles.ts`
- Modify: `apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx`
- Modify: `apps/mobile/src/screens/auth/styles/forgot-password-screen.styles.ts`
- Test: `apps/mobile/src/screens/auth/__tests__/EmailSignInScreen.test.tsx`, `ForgotPasswordScreen.test.tsx`
- Modify: `apps/backend/test/auth.ts` (two helpers)
- Create: `apps/backend/src/__integration__/journeys/a28-social-password.test.ts`
- Modify: `apps/backend/src/__integration__/journeys/a24-social-registration.test.ts` (a nanny case)

**Interfaces:**
- Consumes: `signInWithGoogleAs(email, { phoneNumber })` and `signInAs(email, password)` from `apps/backend/test/auth.ts`.
- Produces two test helpers in `apps/backend/test/auth.ts`:
  - `resetPasswordByEmailLink(email: string, newPassword: string): Promise<void>`
  - `setPasswordWithIdToken(idToken: string, newPassword: string): Promise<void>`

- [ ] **Step 1: Write the failing mobile tests.**

In `EmailSignInScreen.test.tsx`, reuse the file's existing render helper:

```tsx
it('tells a Google or Apple user how to get a password', () => {
  renderScreen();
  expect(
    screen.getByText(
      'Signed up with Google or Apple? Use that button, or tap Forgot password to create a password.',
    ),
  ).toBeTruthy();
});
```

In `ForgotPasswordScreen.test.tsx`, likewise reusing the existing helper:

```tsx
it('says a reset also creates a password for a Google or Apple account', () => {
  renderScreen();
  expect(
    screen.getByText('Signed up with Google or Apple? This also creates a password for your account.'),
  ).toBeTruthy();
});
```

If a file's helper has a different name or returns queries instead of using `screen`, adapt to the file's pattern.

- [ ] **Step 2: Run the tests and watch them fail.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/EmailSignInScreen.test.tsx src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx`
Expected: the two new tests FAIL.

- [ ] **Step 3: Implement the mobile copy.**

`EmailSignInScreen.tsx`: directly after the `passwordMeta` `View`, and still inside the form `View`, add:

```tsx
            {/* A Google/Apple sign-up has no password until a reset creates
                one — Firebase adds the password to that same account. */}
            <Text style={styles.socialHint}>
              Signed up with Google or Apple? Use that button, or tap Forgot password to create a password.
            </Text>
```

Also update the component docstring: this is also where a Google/Apple user is told how to get a password.

`email-sign-in-screen.styles.ts`, next to `forgotLink`:

```ts
  socialHint: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
```

If `typeScale.bodySm` doesn't exist, use the smallest body style the file already imports.

`ForgotPasswordScreen.tsx`: in the final `else` branch of the headline group (the `channel === null` subtitle "Choose how you'd like to reset your password."), wrap the subtitle in a fragment and add a second line:

```tsx
            ) : (
              <>
                <Text style={styles.subtitle}>
                  Choose how you{'’'}d like to reset your password.
                </Text>
                <Text style={styles.socialHint}>
                  Signed up with Google or Apple? This also creates a password for your account.
                </Text>
              </>
            )}
```

Add the same `socialHint` style to `forgot-password-screen.styles.ts`.

- [ ] **Step 4: Run the mobile tests and watch them pass.**

Run: `cd apps/mobile && pnpm exec jest src/screens/auth/__tests__/EmailSignInScreen.test.tsx src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the backend helpers.** In `apps/backend/test/auth.ts`, after `signInWithGoogleAs`/`googleIdpSignIn`, add:

```ts
/**
 * What Forgot password → "Email me a reset link" does, end to end: Firebase
 * mails an out-of-band code, the user opens it and picks a password. The
 * emulator mails nothing and lists the codes it issued instead.
 */
export async function resetPasswordByEmailLink(email: string, newPassword: string): Promise<void> {
  const send = await fetch(`${IDENTITY_TOOLKIT}/accounts:sendOobCode?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  if (!send.ok) throw new Error(`sendOobCode failed for ${email}: ${send.status}`);

  const listed = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const { oobCodes } = (await listed.json()) as {
    oobCodes: { email: string; requestType: string; oobCode: string }[];
  };
  // Last one wins: the emulator appends, and only the newest code is live.
  const code = [...oobCodes]
    .reverse()
    .find((c) => c.email === email && c.requestType === 'PASSWORD_RESET');
  if (!code) throw new Error(`No password-reset code issued for ${email}`);

  const reset = await fetch(`${IDENTITY_TOOLKIT}/accounts:resetPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code.oobCode, newPassword }),
  });
  if (!reset.ok) throw new Error(`resetPassword failed for ${email}: ${reset.status}`);
}

/**
 * What Forgot password → "Text me a code instead" does once the code has
 * signed her in: RNFB's `updatePassword` is exactly this `accounts:update`.
 */
export async function setPasswordWithIdToken(idToken: string, newPassword: string): Promise<void> {
  const response = await fetch(`${IDENTITY_TOOLKIT}/accounts:update?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, password: newPassword, returnSecureToken: true }),
  });
  if (!response.ok) {
    throw new Error(`accounts:update failed: ${response.status} ${await response.text()}`);
  }
}
```

- [ ] **Step 6: Write the integration test** `apps/backend/src/__integration__/journeys/a28-social-password.test.ts`:

```ts
/**
 * A28 — a Google or Apple sign-up can get a password.
 *
 * Nothing in the wizard asks a Google/Apple user for one, so the email door
 * points them at Forgot password. This proves both reset channels really
 * leave a password on the *same* Firebase account — the emulator runs the
 * real identitytoolkit logic, so a pass here is Firebase's behaviour, not ours.
 */
import { firebaseAuth } from '@backend/lib/firebase';

import {
  resetPasswordByEmailLink,
  setPasswordWithIdToken,
  signInAs,
  signInWithGoogleAs,
} from '../../../test/auth';

const NEW_PASSWORD = 'chosen-later-123';

function uniqueEmail(): string {
  return `google-pw-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

async function providersOf(email: string): Promise<string[]> {
  const user = await firebaseAuth.getUserByEmail(email);
  return user.providerData.map((p) => p.providerId);
}

describe('A28 — a password for a Google account', () => {
  it('the email reset link adds a password to a Google-only account', async () => {
    const email = uniqueEmail();
    const googleToken = await signInWithGoogleAs(email);
    const { uid } = await firebaseAuth.verifyIdToken(googleToken);
    expect(await providersOf(email)).toEqual(['google.com']);

    await resetPasswordByEmailLink(email, NEW_PASSWORD);

    expect(await providersOf(email)).toEqual(expect.arrayContaining(['google.com', 'password']));
    const passwordToken = await signInAs(email, NEW_PASSWORD);
    expect((await firebaseAuth.verifyIdToken(passwordToken)).uid).toBe(uid);
  });

  it('the SMS reset adds a password to a Google account with a phone', async () => {
    const email = uniqueEmail();
    const phone = `+2011${String(Date.now()).slice(-8)}`;
    const googleToken = await signInWithGoogleAs(email, { phoneNumber: phone });
    const { uid } = await firebaseAuth.verifyIdToken(googleToken);

    await setPasswordWithIdToken(googleToken, NEW_PASSWORD);

    expect(await providersOf(email)).toEqual(
      expect.arrayContaining(['google.com', 'phone', 'password']),
    );
    const passwordToken = await signInAs(email, NEW_PASSWORD);
    expect((await firebaseAuth.verifyIdToken(passwordToken)).uid).toBe(uid);
  });
});
```

This test documents Firebase's behaviour. If the emulator **doesn't** add `password` in either case, **stop**: report BLOCKED with the emulator's actual response. The spec's password guidance depends on it, and the controller must take it to the owner.

- [ ] **Step 7: Add a nanny case to A24.** In `a24-social-registration.test.ts`, add constants and a test that mirrors the existing mother test's shape, using the nanny body from `a10-nanny-onboarding.test.ts` `registerNanny` without `emailVerificationToken`:

```ts
const ID_FRONT = 'https://storage.example.test/nanny-id-front.jpg';
const AVATAR = 'https://storage.example.test/nanny-avatar.jpg';

it('registers a Google sign-up as a nanny, pending review, with no token', async () => {
  const email = uniqueEmail();
  const phone = uniquePhone();
  const idToken = await signInWithGoogleAs(email, { phoneNumber: phone });

  const response = await request(app)
    .post('/auth/register')
    .set(...authHeader(idToken))
    .send({
      ...registrationBody(email, phone),
      role: 'NANNY',
      idDocumentType: 'PASSPORT',
      idDocumentFrontUrl: ID_FRONT,
      avatarUrl: AVATAR,
      bio: 'Five years with toddlers, first-aid trained.',
      yearsOfExperience: 5,
      availabilityType: 'FULL_TIME',
      ageRanges: ['0-1', '2-5'],
      schedule: { '1': { available: true, startTime: '08:00', endTime: '18:00' } },
    });

  expect(response.status).toBe(201);
  expect(response.body.data.role).toBe('NANNY');
  expect(response.body.data.isEmailVerified).toBe(true);
  expect(response.body.data.isPhoneVerified).toBe(true);
  expect(response.body.data.approvalStatus).toBe('PENDING_REVIEW');
});
```

If the register response has no `approvalStatus` field, assert it on the DB row instead: `prisma.user.findUniqueOrThrow({ where: { phone } })`.

- [ ] **Step 8: Run the backend tests on the local test stack.** Integration needs the stack. If `curl -s localhost:9099` gets no answer, start it in the background with `pnpm test:env` from the repo root, and wait until ports 55432, 9099 and 4010 answer.

Run: `cd apps/backend && pnpm exec jest --selectProjects integration --maxWorkers=1 --testPathPattern "a24-social|a28-social"`
Expected: PASS. Also run `pnpm typecheck` in `apps/backend`; expect exit 0.

- [ ] **Step 9: Commit.**

```bash
git add apps/mobile/src/screens/auth/EmailSignInScreen.tsx apps/mobile/src/screens/auth/styles/email-sign-in-screen.styles.ts apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx apps/mobile/src/screens/auth/styles/forgot-password-screen.styles.ts apps/mobile/src/screens/auth/__tests__/EmailSignInScreen.test.tsx apps/mobile/src/screens/auth/__tests__/ForgotPasswordScreen.test.tsx apps/backend/test/auth.ts apps/backend/src/__integration__/journeys/a28-social-password.test.ts apps/backend/src/__integration__/journeys/a24-social-registration.test.ts
git commit -m "feat(auth): show Google and Apple users the way to a password

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Device flows and docs follow the new front door

**Files:**
- Modify: `apps/mobile/e2e/flows/_launch.yaml`, `_sign-in.yaml`, `_shot-a-journey.yaml` (comment), `a10-nanny-onboarding.yaml`, `c02-mother-registration.yaml`, `c11-google-sign-up.yaml`, `c12-google-collision.yaml`
- Modify: `apps/mobile/e2e/flows/live/_register-managed.yaml`, `live/reset-email.yaml`, `live/reset-sms.yaml`, `live/sign-in-sms.yaml`, `live/sign-in-sms-no-account.yaml`
- Modify: `apps/mobile/e2e/README.md`, `Docs/testing/e2e-flows.md`, `apps/mobile/CLAUDE.md`

**Interfaces:**
- Consumes: the copy from Task 1 and Task 3, the existing `advance.js` `phone-otp` step, and the runner env vars `SOCIAL_REGISTRATION_EMAIL`, `SOCIAL_REGISTRATION_PHONE`, `SOCIAL_REGISTRATION_PHONE_E164` and `PASSWORD` (all already set by `run.mjs`).
- Produces: nothing new.

Rules for every flow edit:
- A text selector is a full-match regex, so escape `?` as `\?`.
- `'Sign up'` matches only the sign-in button: "Sign up as a mother" doesn't full-match.

- [ ] **Step 1: Launch lands on sign-in.** In `_launch.yaml`, change the last wait from `'Care you can trust'` to `'Welcome to NannyNow'`, and update any comment that names the splash.

- [ ] **Step 2: Sign-up flows go through "Sign up".** In `a10`, `c02`, `c11` (first occurrence, line 17), `c12` and `live/_register-managed.yaml`, replace

```yaml
- tapOn: 'Get Started'
```

with

```yaml
- tapOn: 'Sign up'
```

Keep the `'Create your account'` wait that follows it.

- [ ] **Step 3: Sign-in flows start on sign-in.** In `_sign-in.yaml`, replace the four lines from `- tapOn: 'Get Started'` through `- tapOn: 'Sign in with email and password instead'` with:

```yaml
- assertVisible: 'Welcome to NannyNow'
- tapOn: 'Sign in with email'
```

Update its header comment: it starts on the sign-in screen.

In `live/sign-in-sms.yaml` and `live/sign-in-sms-no-account.yaml`, delete the `Get Started`, `Create your account` and `Sign in` lines, and change `assertVisible: 'Welcome back'` to `assertVisible: 'Welcome to NannyNow'`.

In `live/reset-email.yaml` and `live/reset-sms.yaml`, replace the lines from `Get Started` through `tapOn: 'Forgot password\?'` with:

```yaml
- assertVisible: 'Welcome to NannyNow'
# Reset now sits on the front door itself.
- tapOn: 'Forgot password\?'
```

Also, in every `live/*` flow, change a post-sign-out wait on `'Care you can trust'` to `'Welcome to NannyNow'`.

- [ ] **Step 4: C11's second half, and its new password tail (C16).** In `c11-google-sign-up.yaml`:
  - Change the post-sign-out wait `'Care you can trust'` to `'Welcome to NannyNow'`.
  - Replace the following `Get Started` / `Create your account` / `Sign in` / `Welcome back` hop with nothing: she is already on sign-in, so the flow goes straight to `- tapOn: 'Continue with Google'`.
  - Update the header comment ("comes back through sign-in").
  - After the final `'Book care'` wait at the end of the file, append:

```yaml
# ── C16: a Google sign-up gets a password ──────────────────────────────────
# Nothing in the Google wizard asks for a password, so the email door says
# how to get one: Forgot password. The SMS reset signs her in with the phone
# she linked at step 3 and sets a password on that same account — proven by
# signing out and coming back through the email door with it.
- tapOn: 'Account'
- scrollUntilVisible:
    element:
      text: 'Sign out'
    direction: DOWN
    centerElement: true
    timeout: 30000
- tapOn: 'Sign out'
- extendedWaitUntil:
    visible: 'Welcome to NannyNow'
    timeout: 30000

- tapOn: 'Sign in with email'
- assertVisible: 'Signed up with Google or Apple\? Use that button, or tap Forgot password to create a password\.'
- tapOn: 'Forgot password\?'
- extendedWaitUntil:
    visible: 'Reset your password'
    timeout: 30000
- assertVisible: 'Signed up with Google or Apple\? This also creates a password for your account\.'

- tapOn: 'Text me a code instead'
- tapOn:
    id: 'forgotPassword.phone'
- inputText: ${SOCIAL_REGISTRATION_PHONE}
- hideKeyboard
- tapOn: 'Send code'
- extendedWaitUntil:
    visible: 'New password'
    timeout: 60000
- runScript:
    file: ../scripts/advance.js
    env:
      ADVANCE: phone-otp
      OTP_PHONE: ${SOCIAL_REGISTRATION_PHONE_E164}
- assertTrue: ${output.otp != null}
- tapOn:
    id: 'forgotPassword.code.boxes'
- inputText: ${output.otp}
- hideKeyboard
- tapOn: 'Enter a new password'
- inputText: ${PASSWORD}
- hideKeyboard
- tapOn: 'Re-enter your password'
- inputText: ${PASSWORD}
- hideKeyboard
- scrollUntilVisible:
    element:
      text: 'Reset password'
    direction: DOWN
    timeout: 20000
- tapOn: 'Reset password'
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000

- tapOn: 'Account'
- scrollUntilVisible:
    element:
      text: 'Sign out'
    direction: DOWN
    centerElement: true
    timeout: 30000
- tapOn: 'Sign out'
- extendedWaitUntil:
    visible: 'Welcome to NannyNow'
    timeout: 30000
- runFlow:
    file: _sign-in.yaml
    env:
      EMAIL: ${SOCIAL_REGISTRATION_EMAIL}
      PASSWORD: ${PASSWORD}
- extendedWaitUntil:
    visible: 'Book care'
    timeout: 60000
```

In `c11` and `c12`, the comments that say "Welcome back" become "sign-in".

- [ ] **Step 5: Check that no stale copy is left.**

Run: `cd apps/mobile/e2e && grep -rn "Get Started\|Care you can trust\|Welcome back\|Sign in with email and password instead" .`
Expected: no output.

- [ ] **Step 6: Docs.**
  - `apps/mobile/e2e/README.md` and `Docs/testing/e2e-flows.md`: every mention of the Get Started splash or "Welcome back" becomes "the sign-in screen (Welcome to NannyNow)". Add the C16 tail to C11's description: after Google sign-in, she signs out, resets by SMS, sets a password and signs in by email.
  - `apps/mobile/CLAUDE.md`: where the auth screens or the app entry are listed, say the signed-out landing is `/(auth)/sign-in`. It holds the phone door, Google/Apple, the email-door button, Forgot password, Sign up and Continue as guest; the splash screen is gone. Returning to it uses `router.dismissTo`.

- [ ] **Step 7: Commit.**

```bash
git add apps/mobile/e2e/flows/_launch.yaml apps/mobile/e2e/flows/_sign-in.yaml apps/mobile/e2e/flows/_shot-a-journey.yaml apps/mobile/e2e/flows/a10-nanny-onboarding.yaml apps/mobile/e2e/flows/c02-mother-registration.yaml apps/mobile/e2e/flows/c11-google-sign-up.yaml apps/mobile/e2e/flows/c12-google-collision.yaml apps/mobile/e2e/flows/live/_register-managed.yaml apps/mobile/e2e/flows/live/reset-email.yaml apps/mobile/e2e/flows/live/reset-sms.yaml apps/mobile/e2e/flows/live/sign-in-sms.yaml apps/mobile/e2e/flows/live/sign-in-sms-no-account.yaml apps/mobile/e2e/README.md Docs/testing/e2e-flows.md apps/mobile/CLAUDE.md
git commit -m "test(e2e): flows start at the sign-in front door; C11 sets a password

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Device runs (smoke, c02, a10, c11 and c12, twice each) are done by the controller after Task 4, following the `mobile-e2e-lab` skill.
