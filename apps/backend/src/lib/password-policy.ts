import type { PasswordPolicyConfig } from 'firebase-admin/auth';

/**
 * The Firebase project's password policy. The app checks the same rules on
 * every screen that sets a password (RegistrationAccountScreen,
 * ForgotPasswordScreen); this exists for the one place it can't — Firebase's
 * hosted page behind the reset email, which otherwise accepts any 6
 * characters. Change both together. Pushed to the project by
 * prisma/sync-firebase-auth-config.ts.
 */
export const PASSWORD_POLICY: PasswordPolicyConfig = {
  enforcementState: 'ENFORCE',
  // The rules apply when a password is set; existing ones keep signing in.
  forceUpgradeOnSignin: false,
  constraints: {
    minLength: 8,
    requireUppercase: true,
    requireNumeric: true,
    requireLowercase: false,
    requireNonAlphanumeric: false,
  },
};
