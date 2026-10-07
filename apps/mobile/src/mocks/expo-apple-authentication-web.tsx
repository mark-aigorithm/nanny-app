/**
 * Web stub for expo-apple-authentication in Vite preview builds. The real
 * package ships JSX in .js files and has no web build; SocialAuthButtons
 * imports it for Apple's own button. A preview never signs in, so the button
 * renders nothing.
 */
export const AppleAuthenticationButtonType = { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 } as const;
export const AppleAuthenticationButtonStyle = { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 } as const;

export function AppleAuthenticationButton(): null {
  return null;
}
