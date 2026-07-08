export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 42;

// No SMS provider is wired up yet, so phone verification is bypassed for
// end-to-end testing: this fixed code is pre-filled and accepted locally
// without sending or confirming a real OTP. Remove once a provider exists.
export const BYPASS_OTP = '000000';
