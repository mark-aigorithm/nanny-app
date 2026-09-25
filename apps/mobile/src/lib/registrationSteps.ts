import type { Href } from 'expo-router';

import type { RegistrationDraft } from '@mobile/store/registrationDraftStore';

/**
 * The registration wizard's steps, in one place: which screens a sign-up
 * visits, in what order, and what each one's "STEP n OF m" label and progress
 * bar say. Every wizard screen asks here instead of counting for itself, so
 * the counts can't drift apart again.
 *
 * | Journey             | Steps                                                        |
 * |---------------------|--------------------------------------------------------------|
 * | Mother, phone       | phone → about → account → location → finish                 |
 * | Nanny, phone        | phone → about → account → location → details → id → finish  |
 * | Mother, Google/Apple| phone → about → location → finish                            |
 * | Nanny, Google/Apple | phone → about → location → details → id → finish             |
 *
 * A resumed sign-up whose account already held a number when the draft was
 * seeded (`phoneOnAccountAtStart`) skips `phone`. That flag is fixed for the
 * whole attempt — unlike `accountPhone`, which the phone step itself fills in
 * — so the counts never shift half-way through.
 *
 * Google/Apple proved the email and gave the account a way to sign in, so the
 * social journeys have no `account` step.
 */
export type StepKey = 'phone' | 'about' | 'account' | 'location' | 'details' | 'id' | 'finish';

type StepDraft = Pick<RegistrationDraft, 'role' | 'authProvider' | 'phoneOnAccountAtStart'>;

const ROUTES: Record<StepKey, (draft: StepDraft) => Href> = {
  phone: () => '/(auth)/register-phone',
  about: () => '/(auth)/register-about',
  account: () => '/(auth)/register-account',
  location: (draft) =>
    draft.role === 'nanny' ? '/(auth)/register-nanny-location' : '/(auth)/register-location',
  details: () => '/(auth)/register-nanny-details',
  id: () => '/(auth)/register-nanny-id',
  finish: () => '/(auth)/register-finish',
};

function titleOf(key: StepKey, draft: StepDraft): string {
  switch (key) {
    case 'phone':
      return 'YOUR NUMBER';
    case 'about':
      return 'ABOUT YOU';
    case 'account':
      return 'SECURE YOUR ACCOUNT';
    case 'location':
      return draft.role === 'nanny' ? 'HOME LOCATION' : 'LOCATION & PREFERENCES';
    case 'details':
      return 'PROFESSIONAL DETAILS';
    case 'id':
      return 'VERIFY YOUR IDENTITY';
    case 'finish':
      return 'FINISH';
  }
}

/** The steps this sign-up visits, in order. */
export function registrationSteps(draft: StepDraft): StepKey[] {
  const isNanny = draft.role === 'nanny';
  const isSocial = draft.authProvider !== 'phone';
  const steps: StepKey[] = [];
  if (!draft.phoneOnAccountAtStart) steps.push('phone');
  steps.push('about');
  if (!isSocial) steps.push('account');
  steps.push('location');
  if (isNanny) steps.push('details', 'id');
  steps.push('finish');
  return steps;
}

export type StepInfo = {
  /** e.g. "STEP 2 OF 5 — ABOUT YOU". */
  label: string;
  /** Share of the wizard done once this step is reached, 0–1. */
  progress: number;
  /** `progress` as a width for a progress-bar fill. */
  width: `${number}%`;
};

/**
 * The label and progress for `key` in this sign-up. A step the journey
 * doesn't visit (it shouldn't be on screen) reads as the first one.
 */
export function stepInfo(key: StepKey, draft: StepDraft): StepInfo {
  const steps = registrationSteps(draft);
  const position = Math.max(steps.indexOf(key), 0) + 1;
  const progress = position / steps.length;
  return {
    label: `STEP ${position} OF ${steps.length} — ${titleOf(key, draft)}`,
    progress,
    width: `${Math.round(progress * 1000) / 10}%`,
  };
}

/** Where the wizard starts, once a role is picked. */
export function firstStep(draft: StepDraft): Href {
  return ROUTES[registrationSteps(draft)[0] ?? 'about'](draft);
}

/**
 * The screen after `key`, or null after `finish` (which leaves the wizard
 * for the notification prompt instead).
 */
export function nextStep(key: StepKey, draft: StepDraft): Href | null {
  const steps = registrationSteps(draft);
  const index = steps.indexOf(key);
  const next = index === -1 ? undefined : steps[index + 1];
  return next ? ROUTES[next](draft) : null;
}
