import { PASSWORD_POLICY } from '@backend/lib/password-policy';

// The app checks these rules itself (RegistrationAccountScreen,
// ForgotPasswordScreen); the policy exists so Firebase's hosted reset page,
// which knows nothing of the app, refuses what the app would.
describe('PASSWORD_POLICY', () => {
  it("enforces the app's rules: 8+ characters, an uppercase letter and a number", () => {
    expect(PASSWORD_POLICY.enforcementState).toBe('ENFORCE');
    expect(PASSWORD_POLICY.constraints).toEqual({
      minLength: 8,
      requireUppercase: true,
      requireNumeric: true,
      requireLowercase: false,
      requireNonAlphanumeric: false,
    });
  });

  it('lets existing, weaker passwords keep signing in', () => {
    expect(PASSWORD_POLICY.forceUpgradeOnSignin).toBe(false);
  });
});
