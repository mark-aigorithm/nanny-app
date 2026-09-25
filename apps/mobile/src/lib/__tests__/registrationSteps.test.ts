import {
  firstStep,
  nextStep,
  registrationSteps,
  stepInfo,
  type StepKey,
} from '@mobile/lib/registrationSteps';
import type { RegistrationDraft } from '@mobile/store/registrationDraftStore';

type StepDraft = Pick<RegistrationDraft, 'role' | 'authProvider' | 'phoneOnAccountAtStart'>;

const MOTHER_PHONE: StepDraft = { role: 'parent', authProvider: 'phone', phoneOnAccountAtStart: false };
const NANNY_PHONE: StepDraft = { role: 'nanny', authProvider: 'phone', phoneOnAccountAtStart: false };
const MOTHER_GOOGLE: StepDraft = { role: 'parent', authProvider: 'google', phoneOnAccountAtStart: false };
const NANNY_APPLE: StepDraft = { role: 'nanny', authProvider: 'apple', phoneOnAccountAtStart: false };

const ROUTE: Record<StepKey, string> = {
  phone: '/(auth)/register-phone',
  about: '/(auth)/register-about',
  account: '/(auth)/register-account',
  location: '',
  details: '/(auth)/register-nanny-details',
  id: '/(auth)/register-nanny-id',
  finish: '/(auth)/register-finish',
};

describe.each([
  ['mother, phone', MOTHER_PHONE, ['phone', 'about', 'account', 'location', 'finish']],
  ['nanny, phone', NANNY_PHONE, ['phone', 'about', 'account', 'location', 'details', 'id', 'finish']],
  ['mother, Google', MOTHER_GOOGLE, ['phone', 'about', 'location', 'finish']],
  ['nanny, Apple', NANNY_APPLE, ['phone', 'about', 'location', 'details', 'id', 'finish']],
  [
    'nanny, phone, resumed with the number on the account',
    { ...NANNY_PHONE, phoneOnAccountAtStart: true },
    ['about', 'account', 'location', 'details', 'id', 'finish'],
  ],
  [
    'mother, Google, resumed with the number on the account',
    { ...MOTHER_GOOGLE, phoneOnAccountAtStart: true },
    ['about', 'location', 'finish'],
  ],
] as const)('%s', (_name, draft, expected) => {
  it('visits these steps, in this order', () => {
    expect(registrationSteps(draft)).toEqual(expected);
  });

  it('numbers every step "n OF total", ending at 100%', () => {
    expected.forEach((key, index) => {
      const info = stepInfo(key, draft);
      expect(info.label).toMatch(new RegExp(`^STEP ${index + 1} OF ${expected.length} — `));
      expect(info.progress).toBeCloseTo((index + 1) / expected.length);
    });
    expect(stepInfo('finish', draft).width).toBe('100%');
  });

  it('walks from the first step to finish, and no further', () => {
    const location =
      draft.role === 'nanny' ? '/(auth)/register-nanny-location' : '/(auth)/register-location';
    const route = (key: StepKey) => (key === 'location' ? location : ROUTE[key]);
    expect(firstStep(draft)).toBe(route(expected[0]));
    for (let i = 0; i < expected.length - 1; i++) {
      expect(nextStep(expected[i]!, draft)).toBe(route(expected[i + 1]!));
    }
    expect(nextStep('finish', draft)).toBeNull();
  });
});

it('names each step', () => {
  expect(stepInfo('phone', MOTHER_PHONE).label).toBe('STEP 1 OF 5 — YOUR NUMBER');
  expect(stepInfo('about', MOTHER_PHONE).label).toBe('STEP 2 OF 5 — ABOUT YOU');
  expect(stepInfo('account', MOTHER_PHONE).label).toBe('STEP 3 OF 5 — SECURE YOUR ACCOUNT');
  expect(stepInfo('location', MOTHER_PHONE).label).toBe('STEP 4 OF 5 — LOCATION & PREFERENCES');
  expect(stepInfo('location', NANNY_PHONE).label).toBe('STEP 4 OF 7 — HOME LOCATION');
  expect(stepInfo('details', NANNY_PHONE).label).toBe('STEP 5 OF 7 — PROFESSIONAL DETAILS');
  expect(stepInfo('id', NANNY_PHONE).label).toBe('STEP 6 OF 7 — VERIFY YOUR IDENTITY');
  expect(stepInfo('finish', NANNY_PHONE).label).toBe('STEP 7 OF 7 — FINISH');
});

it('rounds the bar width to one decimal', () => {
  expect(stepInfo('phone', NANNY_PHONE).width).toBe('14.3%');
});

it('has no next step for a step the journey skips', () => {
  expect(nextStep('account', MOTHER_GOOGLE)).toBeNull();
});
