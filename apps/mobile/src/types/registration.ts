export type Role = 'parent' | 'nanny';

export interface Child {
  name: string;
  age: string;
}

/** A third-party identity provider the app signs in with. Apple is iOS-only. */
export type SocialProvider = 'google' | 'apple';

/** How a registration started: the phone wizard, or a Google/Apple sign-in. */
export type AuthProvider = 'phone' | SocialProvider;
