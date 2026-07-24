/**
 * Minimal web stub for `@mobile/lib/firebase` used during Vite preview builds.
 *
 * The real module calls `initializeApp` at import time, which throws
 * `auth/invalid-api-key` without real credentials and stops the preview from
 * mounting. Screens only ever reach this module transitively via `lib/api`,
 * which reads `auth().currentUser` to attach a JWT — a signed-out shim is
 * exactly right for an offline preview.
 */
export function auth() {
  return {
    currentUser: null,
  };
}

export default auth;
