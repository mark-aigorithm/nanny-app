/**
 * Fixture seeding for the admin E2E suite, over real HTTP.
 *
 * Playwright drives the console; everything the console *reacts to* — a parent
 * booking, a nanny claiming it, a card payment — is created here by calling the
 * same public API the mobile app calls. That keeps the two-driver problem out
 * of the suite: only one surface is ever driven through a UI.
 *
 * Nothing is truncated between specs (the backend on :3001 owns the database
 * for the whole run), so every fixture creates its own accounts under unique
 * emails and a unique surname. A spec finds its own row by that surname.
 */
const API_BASE_URL = process.env['E2E_API_BASE_URL'] ?? 'http://127.0.0.1:3001';
const EMULATOR_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '127.0.0.1:9099';
const PAYMOB_FAKE_URL = process.env['E2E_PAYMOB_FAKE_URL'] ?? 'http://127.0.0.1:4010';

/** The emulator ignores the key but still requires the parameter to be present. */
const IDENTITY_TOOLKIT = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
const API_KEY = 'fake-api-key';

/** Matches the password global-setup provisions the console roles with. */
const PASSWORD = 'test-password-123';

const ID_FRONT = 'https://storage.example.test/e2e-id-front.jpg';
const AVATAR = 'https://storage.example.test/e2e-avatar.jpg';

/**
 * Unique per call, and stable within one. Specs locate their own table row by
 * surname, so it has to be unrecognisable from any other spec's.
 */
let sequence = 0;
function unique(prefix: string): { email: string; surname: string } {
  sequence += 1;
  const stamp = `${Date.now().toString(36)}${sequence}`;
  return { email: `e2e-${prefix}-${stamp}@test.local`, surname: `${prefix}-${stamp}` };
}

function uniquePhone(): string {
  sequence += 1;
  return `+2015${String(Date.now()).slice(-6)}${String(sequence % 100).padStart(2, '0')}`;
}

// ── Auth ──────────────────────────────────────────────────────────

/** Creates an emulator account via the public sign-up endpoint and returns its ID token. */
async function signUp(email: string): Promise<string> {
  const response = await fetch(`${IDENTITY_TOOLKIT}/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };
  if (!body.idToken) {
    throw new Error(
      `Emulator sign-up failed for ${email}: ${body.error?.message ?? response.status}. ` +
        'Is the Auth emulator running (pnpm test:env)?',
    );
  }
  return body.idToken;
}

/** Signs in an account that already exists — used for the seeded console roles. */
export async function signIn(email: string, password = PASSWORD): Promise<string> {
  const response = await fetch(`${IDENTITY_TOOLKIT}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const body = (await response.json()) as { idToken?: string; error?: { message?: string } };
  if (!body.idToken) {
    throw new Error(
      `Emulator sign-in failed for ${email}: ${body.error?.message ?? response.status}.`,
    );
  }
  return body.idToken;
}

// ── HTTP ──────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  token: string,
  body?: Json,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: unknown; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed with ${response.status}: ${payload?.error ?? '(no body)'}. ` +
        `Is the test backend running on ${API_BASE_URL} (pnpm --filter=@nanny-app/backend start:test)?`,
    );
  }

  return payload?.data;
}

/** A superuser token for the console account global-setup provisioned. */
export async function superuserToken(): Promise<string> {
  return signIn('e2e-superuser@test.local');
}

export type ConsoleAccount = {
  email: string;
  /** Rendered by the Team table as-is; the surname half is unique. */
  name: string;
  surname: string;
  password: string;
};

/**
 * Credentials for a console account a spec is about to create **through the
 * console itself**. Nothing is provisioned here — that is the point, since the
 * creating is what B1 is testing. `createAdminUser` makes the Firebase account,
 * so the address only has to be one no previous run has claimed.
 */
export function uniqueConsoleAccount(): ConsoleAccount {
  const { email, surname } = unique('operator');
  return { email, name: `E2E ${surname}`, surname, password: PASSWORD };
}

// ── Fixtures ──────────────────────────────────────────────────────

export type SeededMother = {
  token: string;
  id: number;
  email: string;
  /** Distinctive surname a spec can search the console's tables for. */
  surname: string;
  /** "E2E <surname>", exactly as the console renders it. */
  displayName: string;
};

/**
 * A mother who can book straight away: registered, with an ID submitted. The
 * platform allows booking at PENDING_REVIEW (upload-then-book), so no admin
 * approval is needed for her to appear in the bookings queue.
 */
export async function seedMother(): Promise<SeededMother> {
  const { email, surname } = unique('mother');
  const token = await signUp(email);

  const user = (await call('POST', '/auth/register', token, {
    firstName: 'E2E',
    lastName: surname,
    email,
    phone: uniquePhone(),
    dateOfBirth: '1992-04-01',
    role: 'MOTHER',
    termsAcceptedVersion: '1.0',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '1 Test Street, Cairo',
  })) as { id: number };

  await call('POST', '/auth/id', token, {
    idDocumentType: 'PASSPORT',
    idDocumentFrontUrl: ID_FRONT,
  });

  return { token, id: user.id, email, surname, displayName: `E2E ${surname}` };
}

export type SeededNanny = SeededMother & { nannyProfileId: number };

/**
 * A nanny who has registered and submitted an ID, and is waiting to be vetted —
 * what the ID-review queue and the Nannies tab exist to act on. Needs no admin
 * token, because registration alone is what puts her in `PENDING_REVIEW`.
 */
export async function seedPendingNanny(): Promise<SeededMother> {
  const { email, surname } = unique('nanny');
  const token = await signUp(email);

  const user = (await call('POST', '/auth/register', token, {
    firstName: 'E2E',
    lastName: surname,
    email,
    phone: uniquePhone(),
    dateOfBirth: '1995-06-15',
    role: 'NANNY',
    termsAcceptedVersion: '1.0',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '2 Test Street, Cairo',
    idDocumentType: 'PASSPORT',
    idDocumentFrontUrl: ID_FRONT,
    avatarUrl: AVATAR,
    bio: 'Seeded for the admin E2E suite.',
    yearsOfExperience: 5,
    availabilityType: 'FULL_TIME',
    ageRanges: ['0-1', '2-5'],
  })) as { id: number };

  return { token, id: user.id, email, surname, displayName: `E2E ${surname}` };
}

/** A registered, admin-approved nanny — the only kind that can claim a booking. */
export async function seedApprovedNanny(adminToken: string): Promise<SeededNanny> {
  const { email, surname } = unique('nanny');
  const token = await signUp(email);

  const user = (await call('POST', '/auth/register', token, {
    firstName: 'E2E',
    lastName: surname,
    email,
    phone: uniquePhone(),
    dateOfBirth: '1995-06-15',
    role: 'NANNY',
    termsAcceptedVersion: '1.0',
    latitude: 30.0444,
    longitude: 31.2357,
    address: '2 Test Street, Cairo',
    idDocumentType: 'PASSPORT',
    idDocumentFrontUrl: ID_FRONT,
    avatarUrl: AVATAR,
    bio: 'Seeded for the admin E2E suite.',
    yearsOfExperience: 5,
    availabilityType: 'FULL_TIME',
    ageRanges: ['0-1', '2-5'],
  })) as { id: number };

  // The approve route takes the *profile* id, which registration does not
  // return — look it up through the console's own list endpoint.
  const nannies = (await call('GET', '/admin/nannies?limit=50', adminToken)) as Array<{
    id: number;
    email: string;
  }>;
  const profile = nannies.find((row) => row.email === email);
  if (!profile) throw new Error(`Seeded nanny ${email} is missing from /admin/nannies.`);

  await call('POST', `/admin/nannies/${profile.id}/approve`, adminToken);

  return {
    token,
    id: user.id,
    email,
    surname,
    displayName: `E2E ${surname}`,
    nannyProfileId: profile.id,
  };
}

/** Wall-clock `daysAhead` days from now at `hour`, in the offset-free format the API expects. */
function wallClockAhead(hour: number, daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00`;
}

export type SeededBooking = {
  id: number;
  totalAmount: number;
  mother: SeededMother;
};

/**
 * An unclaimed PENDING booking — what an admin sees at the top of the queue.
 * Returns the mother too, since specs locate the row by her name.
 */
export async function seedPendingBooking(
  options: {
    startHour?: number;
    durationHours?: number;
    mother?: SeededMother;
    /**
     * Days from today. Defaults to tomorrow; raise it to give one mother
     * several bookings that cannot overlap, which is the cheap way to fill a
     * list without paying for an account per row.
     */
    daysAhead?: number;
  } = {},
): Promise<SeededBooking> {
  const { startHour = 10, durationHours = 4, daysAhead = 1 } = options;
  const mother = options.mother ?? (await seedMother());

  const booking = (await call('POST', '/bookings', mother.token, {
    startTime: wallClockAhead(startHour, daysAhead),
    endTime: wallClockAhead(startHour + durationHours, daysAhead),
    children: [{ name: 'E2E Child', ageYears: 3, allergies: null }],
  })) as { id: number; totalAmount: number };

  return { id: booking.id, totalAmount: booking.totalAmount, mother };
}

/**
 * A CONFIRMED, fully-paid booking: a nanny claims the request (which is what
 * makes it payable) and the mother pays through the Paymob fake, whose signed
 * webhook the backend verifies for real.
 */
export async function seedPaidBooking(
  adminToken: string,
  options: { startHour?: number; durationHours?: number } = {},
): Promise<SeededBooking & { nanny: SeededNanny }> {
  const nanny = await seedApprovedNanny(adminToken);
  const booking = await seedPendingBooking(options);

  await call('POST', `/bookings/${booking.id}/accept`, nanny.token);

  const session = (await call('POST', `/bookings/${booking.id}/pay/paymob`, booking.mother.token, {
    method: 'CARD',
  })) as { clientSecret: string };

  await settleCheckout(session.clientSecret);

  return { ...booking, nanny };
}

/** Marks an intention paid on the fake and delivers its signed webhook. */
async function settleCheckout(clientSecret: string): Promise<void> {
  const paid = await fetch(`${PAYMOB_FAKE_URL}/__test__/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientSecret }),
  });

  if (!paid.ok) {
    throw new Error(
      `Paymob fake returned ${paid.status}. Is it running (pnpm test:env)?`,
    );
  }

  const { hmac, body } = (await paid.json()) as { hmac: string; body: unknown };

  const webhook = await fetch(`${API_BASE_URL}/webhooks/paymob?hmac=${hmac}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!webhook.ok) {
    throw new Error(`The backend rejected the fake's webhook with ${webhook.status}.`);
  }
}

// ── Read-back helpers (assert on the API, not just the screen) ─────

export async function getBooking(adminToken: string, id: number): Promise<{
  status: string;
  totalAmount: number;
  cancellationReason: string | null;
}> {
  return (await call('GET', `/admin/bookings/${id}`, adminToken)) as {
    status: string;
    totalAmount: number;
    cancellationReason: string | null;
  };
}

// ── Mobile-facing reads (what the app sees after an admin edits a catalogue) ──

type Named = { name: string; isActive?: boolean };

/**
 * The skill catalogue as the mobile app reads it.
 *
 * Deliberately the *public* route rather than the admin one: an admin list
 * would confirm the row was written and nothing more. What matters is that it
 * crossed into the surface a nanny actually picks from, which filters to active
 * rows on the way out.
 */
export async function listAppSkills(token: string): Promise<Named[]> {
  return (await call('GET', '/nanny/skills', token)) as Named[];
}

/** The certification catalogue as the nanny's self-service picker reads it. */
export async function listAppCertifications(token: string): Promise<Named[]> {
  return (await call('GET', '/nanny/certifications', token)) as Named[];
}

/** The package catalogue a mother is offered. */
export async function listAppPackages(token: string): Promise<Named[]> {
  return (await call('GET', '/packages', token)) as Named[];
}

export type AppBookingOptions = {
  bookingWindowStartHour: number;
  bookingWindowEndHour: number;
  minBookingHours: number;
  maxBookingHours: number;
  minAdvanceBookingHours: number;
};

/** The booking rules the app's date picker is built from. */
export async function getAppBookingOptions(token: string): Promise<AppBookingOptions> {
  return (await call('GET', '/bookings/options', token)) as AppBookingOptions;
}

/**
 * What the endpoint actually returns — the discount alone. The final figure is
 * the app's subtraction, not the server's, so there is no `finalAmount` here.
 */
export type PromoValidation = { discountAmount: number };

/** Applies a promo code exactly as the checkout screen does. */
export async function validateAppPromo(
  motherToken: string,
  code: string,
  subtotal: number,
): Promise<PromoValidation> {
  return (await call('POST', '/bookings/validate-promo', motherToken, {
    code,
    subtotal,
  })) as PromoValidation;
}

export type KycSubject = {
  idVerificationStatus: string;
  rejectionReason: string | null;
};

/**
 * A parent's KYC state, straight from the API.
 *
 * Worth reading back rather than trusting the badge: the console decides an ID
 * queue is "cleared" by re-fetching a filtered list, which would look identical
 * if the row had merely stopped matching the filter for some other reason.
 */
export async function getMotherKyc(adminToken: string, id: number): Promise<KycSubject> {
  return (await call('GET', `/admin/mothers/${id}`, adminToken)) as KycSubject;
}
