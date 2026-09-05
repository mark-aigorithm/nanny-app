import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────
// Manual release-test catalogue.
//
// The scenarios a person walks by hand before a production release, derived
// from the shipped surfaces — `apps/backend/src/routes`, `apps/mobile/app`,
// `apps/mobile/src/screens` and `apps/admin/src/pages` — not from
// `Docs/user-stories`, which has drifted from the build.
//
// It lives in `shared` because two consumers need the same list: the admin
// console renders it on the public /qa page, and the backend uses it as the
// allowlist for which checklist keys a write may touch.
//
// Ordered by how often each one happens in production, so a run that stops
// early has covered the most-trodden ground. The display number is the array
// index + 1; the persistence key is `id`, which never changes — otherwise
// inserting a scenario would silently reassign everyone's results.
// ──────────────────────────────────────────────────────────────────────

export const QA_AREAS = [
  'Auth',
  'Home',
  'Booking',
  'Payments',
  'Care',
  'Reviews',
  'Notifications',
  'Messaging',
  'Community',
  'Marketplace',
  'Events',
  'Packages',
  'Rewards',
  'Referrals',
  'Support',
  'Profile',
  'Guest',
  'Admin',
  'Platform',
] as const;
export const QaAreaSchema = z.enum(QA_AREAS);
export type QaArea = z.infer<typeof QaAreaSchema>;

export const QA_SURFACES = ['Parent app', 'Nanny app', 'Admin console', 'Cross-surface'] as const;
export const QaSurfaceSchema = z.enum(QA_SURFACES);
export type QaSurface = z.infer<typeof QaSurfaceSchema>;

export const QA_PRIORITIES = ['P0', 'P1', 'P2'] as const;
export const QaPrioritySchema = z.enum(QA_PRIORITIES);
export type QaPriority = z.infer<typeof QaPrioritySchema>;

/**
 * NOT_RUN is the absence of a result, so it is also what a scenario reads as
 * before anyone has touched it — there is no separate "unset".
 */
export const QA_STATUSES = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'] as const;
export const QaStatusSchema = z.enum(QA_STATUSES);
export type QaStatus = z.infer<typeof QaStatusSchema>;

export interface QaScenario {
  /** Stable slug. The persistence key — never derived from the display number. */
  id: string;
  area: QaArea;
  surface: QaSurface;
  priority: QaPriority;
  /** True when the scenario's subject is a refusal or failure path. */
  negative?: boolean;
  /**
   * A defect we already know about, shown on the row so a tester reports the
   * scenario as failing rather than filing it as a new discovery.
   */
  knownGap?: string;
  title: string;
  preconditions: string[];
  steps: string[];
  expected: string[];
}

/** One entry of recorded state, as stored per scenario on the server. */
export const QaChecklistEntrySchema = z.object({
  status: QaStatusSchema,
  /** Free-text observation. Capped so an open endpoint cannot be used as storage. */
  note: z.string().max(500).default(''),
  /** Who ran it — initials or a first name, not an identity. */
  tester: z.string().max(40).default(''),
  updatedAt: z.string(),
});
export type QaChecklistEntry = z.infer<typeof QaChecklistEntrySchema>;

/** The write payload: everything but `updatedAt`, which the server stamps. */
export const SetQaScenarioStatusSchema = z.object({
  status: QaStatusSchema,
  note: z.string().max(500).optional(),
  tester: z.string().max(40).optional(),
});
export type SetQaScenarioStatusInput = z.infer<typeof SetQaScenarioStatusSchema>;

export interface QaChecklistState {
  /** Keyed by scenario id. A scenario with no entry has never been run. */
  entries: Record<string, QaChecklistEntry>;
}

// ──────────────────────────────────────────────────────────────────────
// Tier A — happens on every session and every booking (1–25)
// ──────────────────────────────────────────────────────────────────────

const TIER_A: QaScenario[] = [
  {
    id: 'parent-sign-in',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Mother signs in with her phone number and password',
    preconditions: ['A registered mother account with a known password'],
    steps: [
      'Open the app and tap "Sign in" on the welcome screen',
      'Pick the country code, type the phone number and the password',
      'Tap "Sign in"',
    ],
    expected: [
      'The app lands on the parent Home screen',
      'Her first name appears in the greeting',
      'A wrong password is refused with a readable message, not a raw Firebase error code',
    ],
  },
  {
    id: 'session-restored-on-relaunch',
    area: 'Auth',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'A signed-in session survives closing and reopening the app',
    preconditions: ['Signed in as a mother on one device and as an approved nanny on another'],
    steps: [
      'Force-close the app completely',
      'Reopen it and wait through the splash',
    ],
    expected: [
      'No sign-in screen — the mother lands on Home, the nanny on her Dashboard',
      'A nanny whose ID is still awaiting review lands on the "pending review" screen instead',
      'A nanny whose ID was rejected is sent back to the ID upload screen',
    ],
  },
  {
    id: 'parent-home-loads',
    area: 'Home',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The parent Home screen loads with every card in place',
    preconditions: ['Signed in as a mother', 'At least one live campaign configured in the console'],
    steps: ['Open the app on Home and scroll the whole screen'],
    expected: [
      'Greeting with her name, and her saved location on the map card',
      '"Book care" is present and tappable',
      'The campaign carousel shows the live campaigns and scrolls sideways',
      'If she has a booking in progress or upcoming, its card/banner is shown at the top',
      'The bottom tab bar shows Home, Services, Activity and Account',
    ],
  },
  {
    id: 'book-care-date-time-duration',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Book care — pick the date, start time and duration',
    preconditions: ['Signed in as a mother whose ID is verified'],
    steps: [
      'Tap "Book care" on Home',
      'Pick a date, a start time and a duration',
      'Try to pick a time before the booking window opens and after it closes',
      'Try to pick fewer hours than the minimum and more than the maximum',
      'Continue',
    ],
    expected: [
      'Only times inside the configured booking window can be chosen',
      'Duration is clamped to the configured minimum and maximum hours',
      'A start time too soon from now is refused (minimum advance notice)',
      'Continue moves to the care-details screen with the chosen values carried over',
    ],
  },
  {
    id: 'book-care-details',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Book care — children, skills, address and instructions',
    preconditions: ['On the care-details step of a new booking'],
    steps: [
      'Choose how many children and their ages',
      'Select one or more required skills',
      'Confirm or change the care address',
      'Type special instructions, e.g. an allergy',
      'Continue',
    ],
    expected: [
      'Adding children beyond the included count shows the extra-child fee',
      'Exceeding the maximum children per booking is refused',
      'Selected skills are reflected in the price on the next step',
      'The address and instructions carry through to the review screen',
    ],
  },
  {
    id: 'book-care-review-and-submit',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Book care — review the price breakdown and submit the request',
    preconditions: ['On the review step with children, skills and time chosen'],
    steps: [
      'Read the full price breakdown — hourly rate, duration, extra children, skill fees, service fee',
      'Tap the button that creates the request',
    ],
    expected: [
      'Every line of the breakdown is labelled and the total adds up',
      'The request is created and the app moves to the confirmation screen',
      'No nanny is assigned yet and no money has been taken',
    ],
  },
  {
    id: 'broadcast-searching-state',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The confirmation screen holds a live "searching for a nanny" state',
    preconditions: ['A request was just created and no nanny has accepted yet'],
    steps: ['Stay on the confirmation screen and watch it for a minute', 'Leave the screen and come back'],
    expected: [
      'A searching state with an elapsed timer that keeps counting',
      'No payment is offered while no nanny has accepted',
      'Returning to the screen shows the same state, not a stale or blank one',
    ],
  },
  {
    id: 'nanny-sees-broadcast-request',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'The nanny finds the broadcast request in her Requests tab',
    preconditions: [
      'An approved nanny, inside the broadcast radius, holding every skill the request was priced for',
      'She is free for the requested window',
      'A request created moments ago by a mother',
    ],
    steps: ['Open the Nanny app and go to the Requests tab', 'Find the new request and open it'],
    expected: [
      'The request is in her list, with the right date, time, duration and pay',
      'The children summary and any special instructions (e.g. the allergy) are shown correctly',
      'The required skills are listed',
    ],
  },
  {
    id: 'nanny-accepts-request',
    area: 'Booking',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'The nanny accepts, which both claims and approves the request',
    preconditions: ['The nanny is looking at the open request', 'The mother is on her confirmation screen'],
    steps: ['Tap "Accept request"', 'Switch to the mother\'s device'],
    expected: [
      'The booking moves from pending to approved',
      'The mother\'s screen stops searching and reveals the nanny — name, photo and rating',
      'The mother is now offered "Complete payment"',
      'The nanny sees the shift on her Dashboard',
    ],
  },
  {
    id: 'parent-pays-by-card',
    area: 'Payments',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother pays by card and the booking is confirmed',
    preconditions: ['A booking a nanny has accepted', 'Live Paymob credentials for the environment under test'],
    steps: [
      'Tap "Complete payment"',
      'Complete the card payment in the Paymob checkout page that opens',
      'Wait for the app to come back',
    ],
    expected: [
      'The amount charged matches the total shown on the review screen exactly',
      'The payment result screen reports success',
      'The booking status becomes confirmed on the mother\'s screen and on the nanny\'s',
      'A receipt reaches the email address proved during registration',
    ],
  },
  {
    id: 'nanny-dashboard-upcoming-shift',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'The nanny\'s dashboard shows the confirmed shift and her earnings',
    preconditions: ['A confirmed booking assigned to this nanny'],
    steps: ['Open the Nanny app on the Dashboard tab'],
    expected: [
      'The upcoming shift is listed with the correct date, time and address',
      'Her share of the fee is shown and matches the platform/nanny split',
      'An upcoming-shift banner appears as the start time approaches',
    ],
  },
  {
    id: 'start-pin-and-check-in',
    area: 'Booking',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'Start PIN — the nanny asks, the mother reads it out, the nanny checks in',
    preconditions: ['A confirmed booking whose start time is within the check-in window'],
    steps: [
      'On the nanny device, open the shift and start the check-in',
      'On the mother device, open the booking and read the PIN shown',
      'Type that PIN on the nanny device',
    ],
    expected: [
      'The PIN shown to the mother is the one the nanny app accepts',
      'The booking becomes in-progress on both devices',
      'The shift timer starts',
      'A wrong PIN is refused without changing the booking',
      'Checking in more than 15 minutes before the start time is refused with that reason',
    ],
  },
  {
    id: 'nanny-writes-care-log',
    area: 'Care',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'The nanny writes a care-log entry during the shift',
    preconditions: ['A shift in progress'],
    steps: ['Open the care log for the shift', 'Add an entry — e.g. a meal or a nap — and save it'],
    expected: [
      'The entry appears in her list immediately, with a timestamp',
      'Adding a second entry keeps both in order',
    ],
  },
  {
    id: 'parent-reads-care-log',
    area: 'Care',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother reads the care log on her booking detail',
    preconditions: ['The nanny has written at least one care-log entry on a shift in progress'],
    steps: ['On the mother device, open the in-progress booking', 'Scroll to the care-log section'],
    expected: [
      'Every entry the nanny wrote is visible, with its timestamp',
      'The section updates when the mother refreshes after a new entry is written',
    ],
  },
  {
    id: 'nanny-checks-out',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'The nanny checks out and the booking completes',
    preconditions: ['A shift in progress'],
    steps: ['Tap the check-out control and confirm'],
    expected: [
      'The booking becomes completed on both devices',
      'The shift leaves her upcoming list and her earnings total moves by her share',
      'The mother is notified that the booking completed',
    ],
  },
  {
    id: 'mandatory-rating-prompt',
    area: 'Reviews',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother is made to rate the booking she just completed',
    preconditions: ['A booking that completed and has not been rated'],
    steps: [
      'Close the app and reopen it as the mother',
      'Try to dismiss the rating sheet by tapping outside it and by pressing back',
      'Give a star rating and a comment, then submit',
    ],
    expected: [
      'A rating sheet is raised over the app on open',
      'It cannot be dismissed — only submitting closes it',
      'It asks about the most recently completed booking',
      'After submitting, the app is usable again and the sheet does not return',
    ],
  },
  {
    id: 'rating-moves-nanny-average',
    area: 'Reviews',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'The submitted rating moves the nanny\'s average',
    preconditions: ['A rating was just submitted for a nanny whose previous average is known'],
    steps: [
      'Open the nanny\'s profile in the admin console (or her public profile in the app)',
      'Compare the average and review count with what they were before',
    ],
    expected: [
      'The review count went up by one',
      'The average moved in the direction of the rating just given',
      'The comment is visible against that booking',
    ],
  },
  {
    id: 'push-per-booking-transition',
    area: 'Notifications',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'A push notification lands for each booking transition and opens the right screen',
    preconditions: [
      'Notification permission granted on both devices',
      'Real devices — push does not arrive on a simulator',
    ],
    steps: [
      'Walk a booking from request through accept, payment, check-in, check-out',
      'With the app in the background each time, watch for the notification',
      'Tap each notification',
    ],
    expected: [
      'The mother is notified when a nanny accepts, when the nanny checks in, and when the booking completes',
      'The nanny is notified of a new broadcast request and of the payment being made',
      'Tapping a notification opens the booking it is about, not the generic home screen',
    ],
  },
  {
    id: 'notification-centre',
    area: 'Notifications',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'Notification centre — list, unread count, open one, mark all read',
    preconditions: ['At least two unread notifications on the account'],
    steps: [
      'Tap the bell to open the notification centre',
      'Note the unread count, open one notification',
      'Go back and tap "Mark all read"',
    ],
    expected: [
      'The unread count matches the number of unread rows',
      'Opening one marks just that one read and the count drops by one',
      '"Mark all read" clears the count and the unread styling on every row',
      'The same works on the nanny app',
    ],
  },
  {
    id: 'activity-and-booking-history',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The Activity tab and booking history list bookings under the right status',
    preconditions: ['A mother with bookings in several states — pending, confirmed, completed, cancelled'],
    steps: ['Open the Activity tab', 'Open booking history and scroll past the first page'],
    expected: [
      'Each booking appears under the status it is actually in',
      'The status wording is plain English, not a raw enum',
      'Older bookings load as you scroll; nothing duplicates or disappears',
      'Opening any booking shows its full detail',
    ],
  },
  {
    id: 'admin-sign-in',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    title: 'An operator signs in to the admin console',
    preconditions: ['An operator account with at least one section granted'],
    steps: ['Open the console URL', 'Sign in with the operator\'s email and password'],
    expected: [
      'The console opens on the first section that account is allowed to see',
      'The sidebar lists only the sections that account holds',
      'A wrong password is refused with a readable message',
    ],
  },
  {
    id: 'admin-bookings-queue',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    title: 'An operator filters and pages the bookings queue and opens a detail',
    preconditions: ['An operator with the Bookings section', 'More bookings than fit on one page'],
    steps: [
      'Open Bookings',
      'Filter by each status in turn',
      'Page forward and back',
      'Open a booking',
    ],
    expected: [
      'Each filter shows only bookings in that status',
      'Paging moves through the queue without repeating or skipping rows',
      'The detail page shows the mother, the nanny, times, the price breakdown, payment state and history',
    ],
  },
  {
    id: 'admin-approves-mother-id',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'An operator approves a mother\'s ID from the review queue',
    preconditions: ['A mother who has uploaded her ID and is awaiting review'],
    steps: [
      'Open the ID review queue in the console',
      'Find that mother — she will be on the last page, the queue is oldest-first',
      'Open her ID document, check it is readable, and approve',
      'Switch to her device and pull to refresh',
    ],
    expected: [
      'The uploaded document image opens and is legible',
      'Approving removes her from the pending queue',
      'Her account shows as verified in the console',
      'She can now start a booking on her device',
    ],
  },
  {
    id: 'booking-blocked-without-verified-id',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    negative: true,
    title: 'Booking is refused while the mother\'s ID is missing or rejected',
    preconditions: ['A mother who has never uploaded an ID, and one whose ID was rejected'],
    steps: ['Sign in as each and tap "Book care" on Home'],
    expected: [
      'The booking flow does not open — an ID upload prompt appears instead',
      'For a rejected ID, the rejection reason is shown',
      'The rest of the app (community, marketplace, messages) is still usable — the gate is on the action, not on the app',
    ],
  },
  {
    id: 'pull-to-refresh',
    area: 'Platform',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Pull-to-refresh reloads Home, bookings and the community feed',
    preconditions: ['Signed in as a mother'],
    steps: ['On Home, Activity and the community feed in turn, pull down to refresh'],
    expected: [
      'A refresh indicator appears while it loads and disappears when done',
      'Changes made elsewhere (a new booking, a new post) show up after the refresh',
      'The indicator never sticks on screen',
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────
// Tier B — once per user, and the money variants (26–55)
// ──────────────────────────────────────────────────────────────────────

const TIER_B: QaScenario[] = [
  {
    id: 'mother-registration-step-1',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Mother registration — personal details, photo and email address',
    preconditions: ['A phone number and email address not already registered'],
    steps: [
      'From the welcome screen tap "Get started" and choose Mother',
      'Fill in the personal details, add a profile photo, enter a real email address',
      'Try to continue with no photo, and with a malformed email',
      'Continue',
    ],
    expected: [
      'Continue stays disabled until a photo has been chosen',
      'A malformed email is rejected with a clear message',
      'The step counter reads "step 1 of 5"',
    ],
  },
  {
    id: 'mother-registration-email-otp',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Mother registration — the email code proves the address',
    preconditions: ['On the email verification step, with access to that inbox'],
    steps: [
      'Wait for the code email and enter the code',
      'Try a wrong code first',
      'Use the resend control and check the cooldown',
    ],
    expected: [
      'The email arrives at the address typed in the previous step',
      'A wrong code is refused and does not advance',
      'Resend is disabled for its cooldown then works',
      'The correct code advances to the password step',
    ],
  },
  {
    id: 'mother-registration-password',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Mother registration — create a password against the requirements checklist',
    preconditions: ['On the create-password step'],
    steps: [
      'Type a short password, then one with no uppercase, then one with no digit',
      'Type a valid password and confirm it',
    ],
    expected: [
      'Each requirement in the checklist ticks off as it is met',
      'Continue stays disabled until every requirement is met',
      'A mismatched confirmation is refused',
    ],
  },
  {
    id: 'mother-registration-location-children',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Mother registration — location, children and preferences',
    preconditions: ['On step 4 of the mother wizard'],
    steps: [
      'Search for an address and pick it from the suggestions',
      'Drag the map pin and confirm the location',
      'Add children with their ages',
      'Continue',
    ],
    expected: [
      'Address search returns suggestions and picking one moves the map',
      'The confirmed location is the one saved',
      'Children entered here appear later in the booking flow and on Account details',
    ],
  },
  {
    id: 'mother-registration-phone-otp',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Mother registration — phone code creates the account',
    preconditions: ['On the final step with a phone that can receive SMS'],
    steps: [
      'Request the code and enter it',
      'Try a wrong code first',
      'Complete registration',
    ],
    expected: [
      'The SMS arrives at the number entered',
      'A wrong code is refused',
      'The account is created and the app moves on to the notification permission screen, then Home',
      'Signing out and back in with that phone and password works',
    ],
  },
  {
    id: 'referral-code-at-registration',
    area: 'Referrals',
    surface: 'Parent app',
    priority: 'P1',
    title: 'A referral code entered during registration is validated and redeemed',
    preconditions: ['A valid referral code from an existing mother', 'A new account being registered'],
    steps: [
      'Enter the referral code in the registration form',
      'Enter a junk code first and watch the field',
      'Finish registering',
    ],
    expected: [
      'A valid code is accepted and shown as recognised',
      'A junk code is rejected in the field, not after registration',
      'After registering, the referrer\'s "invites earned" goes up and both parties receive their points',
      'A second attempt to redeem on the same account is refused',
    ],
  },
  {
    id: 'mother-uploads-id',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother uploads her ID from the booking gate',
    preconditions: ['A registered mother who has not uploaded an ID'],
    steps: [
      'Tap "Book care" so the ID prompt appears',
      'Photograph or pick both sides of the ID and submit',
    ],
    expected: [
      'The camera and gallery both work as sources',
      'Submitting shows the ID as awaiting review',
      'She can carry on using the rest of the app while she waits',
      'The upload appears in the console\'s ID review queue',
    ],
  },
  {
    id: 'role-selection-forks-the-wizard',
    area: 'Auth',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'Role selection forks the wizard — a shorter path for a mother than a nanny',
    preconditions: ['On the role selection screen'],
    steps: [
      'Choose Mother and note the step count on the next screen',
      'Go back, choose Nanny and note it again',
    ],
    expected: [
      'The mother\'s path is 5 steps; the nanny\'s is longer because of details, working area and the ID',
      'The button text names the choice made',
    ],
  },
  {
    id: 'switching-role-discards-draft',
    area: 'Auth',
    surface: 'Cross-surface',
    priority: 'P1',
    negative: true,
    title: 'Switching role mid-registration throws the half-typed answers away',
    preconditions: ['Part-way through one role\'s wizard'],
    steps: [
      'Type details into step 1 as a Mother',
      'Go back to role selection and choose Nanny instead',
      'Look at step 1 again',
    ],
    expected: [
      'The form is empty — none of the mother\'s answers survive into the nanny path',
      'The step counter matches the new role',
    ],
  },
  {
    id: 'nanny-registration-location',
    area: 'Auth',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'Nanny registration — working area',
    preconditions: ['Registering as a nanny, past the password step'],
    steps: ['Search for and confirm the area she works in', 'Continue'],
    expected: [
      'The location is saved and is what the broadcast radius is later measured from',
      'Continue is blocked until a location is confirmed',
    ],
  },
  {
    id: 'nanny-registration-id',
    area: 'Auth',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'Nanny registration — ID upload',
    preconditions: ['Registering as a nanny, on the ID step'],
    steps: ['Capture or pick both sides of the ID and continue'],
    expected: [
      'Both sides must be provided before continuing',
      'The images upload and the flow moves on to her professional details',
    ],
  },
  {
    id: 'nanny-registration-details',
    area: 'Auth',
    surface: 'Nanny app',
    priority: 'P0',
    title: 'Nanny registration — experience, availability, bio and skills',
    preconditions: ['Registering as a nanny, on the details step'],
    steps: [
      'Enter years of experience, pick an availability type, write a bio',
      'Select the skills she holds',
      'Continue and finish with the phone code',
    ],
    expected: [
      'The skills offered are the ones an admin has marked active in the console',
      'After the phone code the account is created and she lands on the "pending review" screen',
      'She cannot reach the dashboard or see any requests while she waits',
    ],
  },
  {
    id: 'admin-approves-nanny',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'An admin approves the nanny, and she starts receiving requests',
    preconditions: ['A nanny awaiting review with a complete profile'],
    steps: [
      'Open her record in the console, review her ID and approve her',
      'On her device, reopen the app',
      'Create a new booking nearby that matches her skills',
    ],
    expected: [
      'She moves from the waiting screen to her Dashboard',
      'The new request appears in her Requests tab — she is now in the broadcast pool',
      'She can accept it',
    ],
  },
  {
    id: 'admin-rejects-nanny-id',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'An admin rejects a nanny\'s ID with a reason and she re-uploads',
    preconditions: ['A nanny awaiting review'],
    steps: [
      'Reject her ID in the console with a specific reason',
      'On her device, reopen the app',
      'Upload a new ID',
    ],
    expected: [
      'She is sent to the ID upload screen and the exact rejection reason is shown to her',
      'Re-uploading puts her back in the review queue',
      'She still cannot see any requests until she is approved',
    ],
  },
  {
    id: 'promo-code-applied',
    area: 'Payments',
    surface: 'Parent app',
    priority: 'P0',
    title: 'A promo code discounts the booking and Paymob is charged the discounted total',
    preconditions: ['A valid, unused promo code created in the console'],
    steps: [
      'Start a booking and enter the promo code on the review step',
      'Note the total before and after',
      'Pay',
    ],
    expected: [
      'The discount is shown as its own line and the total drops by exactly that amount',
      'The amount charged on the Paymob page is the discounted total, not the original',
      'The code\'s usage count goes up by one in the console',
    ],
  },
  {
    id: 'promo-code-refused',
    area: 'Payments',
    surface: 'Parent app',
    priority: 'P0',
    negative: true,
    title: 'Expired, below-minimum-spend and already-used promo codes are refused',
    preconditions: [
      'An expired code, a code with a minimum spend above the booking total, and a single-use code already used by this account',
    ],
    steps: ['Try each of the three codes on the review step of a booking'],
    expected: [
      'Each is refused with a message that says why — expired, minimum spend, already used',
      'The total is unchanged in every case',
      'The booking can still be completed at full price',
    ],
  },
  {
    id: 'care-points-balance',
    area: 'Rewards',
    surface: 'Parent app',
    priority: 'P1',
    title: 'The mother sees her Care Points balance and history',
    preconditions: ['A mother with a non-zero points balance and at least one past entry'],
    steps: ['Open Services → Care Points'],
    expected: [
      'The balance matches the wallet in the console',
      'The history lists each grant and redemption with its date and amount',
      'How points are earned is explained on the screen',
    ],
  },
  {
    id: 'care-points-redeemed',
    area: 'Rewards',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother redeems Care Points against a booking and pays the remainder',
    preconditions: ['A points balance worth less than a booking total'],
    steps: [
      'Start a booking and apply Care Points on the review step',
      'Note the total before and after',
      'Pay the remainder by card',
    ],
    expected: [
      'The points value comes off the total as its own line',
      'Only the remainder is charged on the Paymob page',
      'The balance drops by the points spent and the history shows the redemption',
    ],
  },
  {
    id: 'care-points-restored-on-cancel',
    area: 'Rewards',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Cancelling a points-redeemed booking returns the points',
    preconditions: ['A booking that had Care Points applied and is still cancellable'],
    steps: ['Cancel the booking', 'Reopen Care Points'],
    expected: [
      'The full points amount is back in the balance',
      'The history shows the refund entry as well as the original redemption',
      'The points can be spent again on another booking',
    ],
  },
  {
    id: 'package-purchase',
    area: 'Packages',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother buys an hours package',
    preconditions: ['At least one active package in the console'],
    steps: [
      'Open Services → Packages and read the options',
      'Choose one, go to checkout and pay',
    ],
    expected: [
      'Every active package is listed with its hours, price and validity',
      'The Paymob page charges the package price',
      'The result screen reports success',
      'The purchase appears under package purchases in the console',
    ],
  },
  {
    id: 'package-hours-credited',
    area: 'Packages',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The purchased hours are credited and visible',
    preconditions: ['A package purchase that just completed'],
    steps: ['Open the package hours screen'],
    expected: [
      'The balance shows the hours just bought',
      'The expiry date matches the package validity',
      'Buying a second package adds to the balance rather than replacing it',
    ],
  },
  {
    id: 'package-hours-consumed',
    area: 'Packages',
    surface: 'Parent app',
    priority: 'P0',
    title: 'A booking consumes package hours and the balance decrements',
    preconditions: ['An hours balance larger than the booking about to be made'],
    steps: [
      'Start a booking whose duration is covered by the balance',
      'Apply package hours on the review step and complete the booking',
      'Reopen the package hours screen',
    ],
    expected: [
      'The hours come off the total on the review screen',
      'The balance drops by exactly the booking\'s hours',
      'The consumption is visible in the console\'s purchase ledger',
    ],
  },
  {
    id: 'package-hours-partial-fallback',
    area: 'Packages',
    surface: 'Parent app',
    priority: 'P1',
    negative: true,
    title: 'Booking more hours than the balance falls back to card for the remainder',
    preconditions: ['An hours balance smaller than the booking about to be made'],
    steps: ['Book more hours than the balance covers and apply package hours', 'Pay'],
    expected: [
      'The hours available are applied and the rest is charged to the card',
      'The split is shown clearly on the review screen before paying',
      'The balance goes to zero rather than negative',
    ],
  },
  {
    id: 'cancel-inside-window',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother cancels a booking inside the cancellation window',
    preconditions: ['A confirmed booking whose start is beyond the cancellation window'],
    steps: ['Open the booking and cancel it, confirming the prompt'],
    expected: [
      'The booking becomes cancelled on her screen and on the nanny\'s',
      'The nanny is notified',
      'Any refund due is stated on screen and reaches the card',
    ],
  },
  {
    id: 'cancel-outside-window-refused',
    area: 'Booking',
    surface: 'Parent app',
    priority: 'P0',
    negative: true,
    title: 'Cancelling too close to the start, or after it, is refused',
    preconditions: ['A confirmed booking starting sooner than the cancellation window allows'],
    steps: ['Try to cancel it', 'Try again on a booking that is already in progress'],
    expected: [
      'The cancellation is refused with a message that says why',
      'The booking status is unchanged',
      'No money moves',
    ],
  },
  {
    id: 'nanny-declines-request',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P1',
    title: 'A nanny declines a request and it stays open to the others',
    preconditions: ['An open broadcast request visible to two nannies'],
    steps: ['Decline it on the first nanny\'s device', 'Check the second nanny\'s Requests tab'],
    expected: [
      'It leaves the first nanny\'s list',
      'It is still available to the second nanny, who can accept it',
      'The mother\'s screen is still searching — a decline is not a rejection of the booking',
    ],
  },
  {
    id: 'second-nanny-accept-refused',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P0',
    negative: true,
    title: 'A second nanny accepting an already-claimed request is refused',
    preconditions: ['Two nannies with the same request open on screen'],
    steps: [
      'Accept on the first device',
      'Without refreshing, accept on the second device',
    ],
    expected: [
      'The second acceptance is refused with a message saying it is no longer awaiting a nanny',
      'The booking stays assigned to the first nanny',
      'The request disappears from the second nanny\'s list on refresh',
    ],
  },
  {
    id: 'nanny-outside-radius-excluded',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P0',
    negative: true,
    title: 'A nanny outside the broadcast radius never sees the request',
    preconditions: [
      'An approved nanny whose working area is further from the care address than the configured broadcast radius',
    ],
    steps: ['Create a booking at that address', 'Check the distant nanny\'s Requests tab and her notifications'],
    expected: [
      'The request is not in her list',
      'She receives no push about it',
      'A nanny inside the radius does get it',
    ],
  },
  {
    id: 'nanny-missing-skill-excluded',
    area: 'Booking',
    surface: 'Nanny app',
    priority: 'P0',
    negative: true,
    title: 'A nanny missing a required skill never sees the request',
    preconditions: ['Two nearby approved nannies, only one of whom holds the skill being requested'],
    steps: ['Create a booking that requires that skill', 'Check both nannies\' Requests tabs'],
    expected: [
      'Only the nanny holding the skill sees the request',
      'The other receives no push about it',
    ],
  },
  {
    id: 'nanny-edits-profile',
    area: 'Profile',
    surface: 'Nanny app',
    priority: 'P1',
    title: 'The nanny edits her profile',
    preconditions: ['An approved nanny'],
    steps: [
      'Open the Profile tab',
      'Change the photo, bio, years of experience and availability, and adjust her skills',
      'Save, then reopen the screen',
    ],
    expected: [
      'Every change persists after leaving and returning',
      'The changes show on her record in the admin console',
      'A skill she removes stops her receiving requests that require it',
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────
// Tier C — regular, but not on every booking (56–80)
// ──────────────────────────────────────────────────────────────────────

const TIER_C: QaScenario[] = [
  {
    id: 'messaging-thread',
    area: 'Messaging',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Messaging — inbox, thread, send a reply, unread badge clears',
    preconditions: ['An existing conversation with at least one unread message'],
    steps: [
      'Note the unread dot on the Account tab',
      'Open the inbox and then the conversation',
      'Send a reply and check the other party\'s device',
    ],
    expected: [
      'The unread dot and count match the unread messages',
      'Opening the thread marks it read and clears the badge',
      'The reply arrives on the other device and shows as unread there',
      'Messages are in order with the right sender on each side',
    ],
  },
  {
    id: 'community-feed-browse',
    area: 'Community',
    surface: 'Parent app',
    priority: 'P1',
    title: 'The community feed loads and filters by category',
    preconditions: ['Posts of more than one category exist'],
    steps: ['Open Services → Community', 'Switch between the category filters', 'Scroll for more posts'],
    expected: [
      'Posts load with author name, photo, time and like/comment counts',
      'Each filter shows only that category',
      'Scrolling loads more without duplicating',
    ],
  },
  {
    id: 'community-create-post',
    area: 'Community',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Create a question post and find it in the feed',
    preconditions: ['Signed in as a mother'],
    steps: ['Create a new post with a distinctive title and body', 'Return to the feed'],
    expected: [
      'The post appears at the top of the feed',
      'It shows her name and photo as the author',
      'Opening it shows the full body',
    ],
  },
  {
    id: 'community-like',
    area: 'Community',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Like a post and a comment, and unlike them again',
    preconditions: ['A post with at least one comment'],
    steps: ['Like the post, then the comment', 'Tap both again to unlike', 'Reload the screen'],
    expected: [
      'Each count goes up by one and the control shows as liked',
      'Unliking puts the count back',
      'The state survives a reload — it is not just local',
    ],
  },
  {
    id: 'community-comment',
    area: 'Community',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Comment on a post',
    preconditions: ['An existing post'],
    steps: ['Open the post, write a comment and send it'],
    expected: [
      'The comment appears immediately with her name and photo',
      'The post\'s comment count goes up by one in the feed',
      'The post author is notified',
    ],
  },
  {
    id: 'events-create-and-rsvp',
    area: 'Events',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Create an event and RSVP to it',
    preconditions: ['Signed in as a mother'],
    steps: [
      'Open Services → Events & Meetups and create an event with a date, place and capacity',
      'From a second account, find it and RSVP',
      'Cancel that RSVP and RSVP again',
    ],
    expected: [
      'The event appears in the events list with its details',
      'The attendee count moves with each RSVP and cancellation',
      'The organiser can see who is attending',
    ],
  },
  {
    id: 'events-capacity-refused',
    area: 'Events',
    surface: 'Parent app',
    priority: 'P1',
    negative: true,
    knownGap:
      'Known gap: the RSVP hook has no error handler, so the refusal is swallowed and the button simply does not change. Report this as a fail until it is fixed.',
    title: 'A full event refuses the next RSVP',
    preconditions: ['An event whose capacity is already filled'],
    steps: ['From another account, try to RSVP to the full event'],
    expected: [
      'The RSVP does not go through — the attendee count stays at capacity',
      'The user should be told the event is full (currently they are not — see the known gap)',
    ],
  },
  {
    id: 'marketplace-browse',
    area: 'Marketplace',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Browse the marketplace and open an item',
    preconditions: ['Approved listings exist, including at least one official listing'],
    steps: ['Open Services → Marketplace', 'Scroll the listings and open one'],
    expected: [
      'Listings show photo, title and price',
      'Official listings are marked and appear above the rest',
      'The detail shows the full description, photos, price and a way to contact the seller',
    ],
  },
  {
    id: 'marketplace-create-listing',
    area: 'Marketplace',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Create a marketplace listing',
    preconditions: ['Signed in as a mother'],
    steps: [
      'Create a listing with a photo, title, description and price',
      'Open My Listings',
    ],
    expected: [
      'The photo uploads and shows on the listing',
      'It is marked as awaiting review in My Listings',
      'It is not yet visible to anybody else in the marketplace',
      'It appears in the console\'s moderation queue',
    ],
  },
  {
    id: 'admin-approves-listing',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'An admin approves a listing and it goes live',
    preconditions: ['A listing awaiting moderation'],
    steps: ['Approve it in the console', 'Look for it in the marketplace from a different account'],
    expected: [
      'It is now visible to other people, not just to its author',
      'The seller is notified that it was approved',
      'My Listings shows it as live',
    ],
  },
  {
    id: 'marketplace-contact-seller',
    area: 'Marketplace',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'A buyer contacts the seller and a conversation is created',
    preconditions: ['A live listing and a second account to buy from it'],
    steps: ['As the buyer, open the listing and contact the seller', 'Send a message', 'Check the seller\'s inbox'],
    expected: [
      'A conversation is created automatically, tied to that listing',
      'The message arrives in the seller\'s inbox with an unread badge',
      'The seller can reply and the buyer receives it',
    ],
  },
  {
    id: 'admin-takes-listing-down',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'An admin takes a live listing down with a reason',
    preconditions: ['A live listing with an existing buyer conversation'],
    steps: ['Take it down in the console with a reason', 'Look for it as the buyer', 'Look at My Listings as the seller'],
    expected: [
      'It disappears from the marketplace for everybody but its author',
      'The contact route is closed with it',
      'The seller sees the reason in My Listings',
    ],
  },
  {
    id: 'marketplace-edit-reenters-review',
    area: 'Marketplace',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'Editing an approved listing sends it back for review',
    preconditions: ['A live, approved listing'],
    steps: ['As the seller, change its price and save', 'Look for it as a buyer'],
    expected: [
      'It leaves the marketplace and shows as awaiting review again',
      'It is back in the console\'s moderation queue — a seller cannot quietly change the price on something people can see',
    ],
  },
  {
    id: 'my-listings-all-states',
    area: 'Marketplace',
    surface: 'Parent app',
    priority: 'P1',
    title: 'My Listings shows the seller her own listings in every state',
    preconditions: ['A seller with a pending, a live and a rejected listing'],
    steps: ['Open My Listings and read each row'],
    expected: [
      'All three are listed, each labelled with its state',
      'The rejected one shows the reason so she can act on it',
      'She can edit or delete her own listings',
    ],
  },
  {
    id: 'refer-a-friend',
    area: 'Referrals',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Refer a friend — the code, the invites earned and the point values',
    preconditions: ['Signed in as a mother', 'Reward config set in the console'],
    steps: ['Open Refer a friend', 'Use the share control', 'Compare the point values on screen with the console config'],
    expected: [
      'Her referral code is shown and can be copied or shared',
      'The points both sides earn match the reward configuration exactly',
      'The count of invites earned is correct',
    ],
  },
  {
    id: 'help-and-support',
    area: 'Support',
    surface: 'Parent app',
    priority: 'P1',
    knownGap:
      'Known gap: the FAQ list is hardcoded in the app. Nothing an operator changes in the console affects it, and no API serves it.',
    title: 'Help & support shows only the configured channels',
    preconditions: ['In the console, set a WhatsApp number and an email, and clear the phone number'],
    steps: ['Open Account → Help on the app', 'Tap each channel shown'],
    expected: [
      'WhatsApp and email cards are shown; there is no call card at all',
      'Each card opens the right external app with the configured value',
      'Setting the phone number in the console makes the call card appear after a refresh',
    ],
  },
  {
    id: 'account-details',
    area: 'Profile',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Account details — view and edit profile, children and address',
    preconditions: ['Signed in as a mother'],
    steps: [
      'Open Account → Account details',
      'Change her name, photo and address; add and remove a child',
      'Save and reopen the screen',
    ],
    expected: [
      'Every change persists after leaving and returning',
      'The changes show on her record in the admin console',
      'A newly added child is selectable in the booking flow',
    ],
  },
  {
    id: 'guest-mode-browse',
    area: 'Guest',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Guest mode — browse without an account',
    preconditions: ['Signed out, on the welcome screen'],
    steps: ['Tap "Continue as guest"', 'Browse Home, the community feed, marketplace and event details'],
    expected: [
      'Home opens with a guest welcome card instead of a booking card',
      'Community posts, marketplace listings and events are all readable, including comments',
      'Nothing shows another user\'s private data',
    ],
  },
  {
    id: 'guest-actions-prompt-register',
    area: 'Guest',
    surface: 'Parent app',
    priority: 'P1',
    negative: true,
    title: 'Every guest action opens the create-account prompt instead',
    preconditions: ['Browsing as a guest'],
    steps: [
      'Try in turn: book care, like a post, comment, RSVP, contact a seller, create a post',
      'Try the Activity and Account tabs',
    ],
    expected: [
      'Each one opens a "create your free account" prompt rather than performing the action',
      'No action goes through anonymously',
      'The prompt leads into registration and, after registering, the app works normally',
    ],
  },
  {
    id: 'forgot-password',
    area: 'Auth',
    surface: 'Parent app',
    priority: 'P0',
    title: 'Forgot password — reset by phone code',
    preconditions: ['A registered account whose phone can receive SMS'],
    steps: [
      'From sign-in, tap "Forgot password"',
      'Enter the phone number and request a code',
      'Enter the code and set a new password',
      'Sign out and sign in with the new password',
    ],
    expected: [
      'The code arrives by SMS to that number',
      'The new password must meet the requirements checklist',
      'After resetting she is signed straight in',
      'The new password works on a fresh sign-in and the old one does not',
    ],
  },
  {
    id: 'sign-out',
    area: 'Auth',
    surface: 'Cross-surface',
    priority: 'P0',
    knownGap:
      'Known gap: signing out does not remove the device\'s push token. On a shared device the next person can keep receiving the previous user\'s notifications.',
    title: 'Signing out really ends the session',
    preconditions: ['Signed in'],
    steps: ['Sign out from the account screen', 'Force-close the app and reopen it'],
    expected: [
      'The app returns to the welcome screen',
      'Reopening does NOT put her back into the account — the session was actually cleared',
      'No data from the previous account is visible after signing in as someone else',
    ],
  },
  {
    id: 'notification-permission',
    area: 'Notifications',
    surface: 'Parent app',
    priority: 'P1',
    title: 'The notification permission step',
    preconditions: ['A freshly registered account on a device that has not been asked yet'],
    steps: [
      'At the end of registration, allow notifications',
      'Repeat on another fresh account and deny them',
    ],
    expected: [
      'Allowing registers the device and pushes arrive later',
      'Denying does not break registration — the app continues to Home',
      'The screen explains what notifications are used for',
    ],
  },
  {
    id: 'extension-happy-path',
    area: 'Booking',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'Mid-shift extension — request extra hours, nanny accepts, mother pays',
    preconditions: ['A booking in progress'],
    steps: [
      'On the mother\'s device, request extra hours on the running booking',
      'On the nanny\'s device, accept the extension request',
      'Back on the mother\'s device, pay for the extra hours',
    ],
    expected: [
      'The nanny is notified and sees the request with the extra hours and pay',
      'After payment the booking\'s end time moves out by the extra hours',
      'The price and both parties\' shares are adjusted',
      'The shift timer reflects the new end time',
    ],
  },
  {
    id: 'extension-declined',
    area: 'Booking',
    surface: 'Cross-surface',
    priority: 'P1',
    negative: true,
    title: 'The nanny declines the extension and the booking is untouched',
    preconditions: ['A pending extension request on a booking in progress'],
    steps: ['Decline it on the nanny\'s device', 'Check the mother\'s booking'],
    expected: [
      'The mother is told it was declined',
      'The end time, price and status of the booking are all unchanged',
      'No money is taken',
    ],
  },
  {
    id: 'extension-cancelled-by-parent',
    area: 'Booking',
    surface: 'Cross-surface',
    priority: 'P1',
    negative: true,
    title: 'The mother cancels the extension before the nanny answers',
    preconditions: ['A pending extension request the nanny has not answered'],
    steps: ['Cancel it on the mother\'s device', 'Check the nanny\'s device'],
    expected: [
      'The request disappears from the nanny\'s device and can no longer be accepted',
      'The booking is unchanged and no money is taken',
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────
// Tier D — operations, money edges and console configuration (81–104)
// ──────────────────────────────────────────────────────────────────────

const TIER_D: QaScenario[] = [
  {
    id: 'admin-status-override',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    title: 'An operator overrides a booking status, and only legal moves are offered',
    preconditions: ['An operator with manage rights on Bookings', 'Bookings in several states'],
    steps: [
      'Open a newly created, unclaimed request and open the status override',
      'Open a confirmed booking and open it again',
      'Open a completed booking',
    ],
    expected: [
      'The unclaimed request offers only "cancelled" — not "completed" or anything the server would refuse',
      'Each booking offers only the moves that are legal from its current state',
      'A completed booking is locked and cannot be overridden',
      'Approve is not offered on a booking with no nanny assigned',
    ],
  },
  {
    id: 'admin-approve-assigned-booking',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P1',
    title: 'An operator approves a pending booking that already has a nanny',
    preconditions: ['A pending booking with a nanny already assigned'],
    steps: ['Open it in the console and approve it'],
    expected: [
      'It moves to approved',
      'The mother is notified and can pay',
      'The action is recorded against the booking',
    ],
  },
  {
    id: 'admin-rejects-booking',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'An operator rejects a pending booking',
    preconditions: ['A pending booking that has not been paid'],
    steps: ['Reject it in the console', 'Open the booking on the mother\'s device'],
    expected: [
      'The booking is cancelled',
      'No payment was ever taken and no charge appears on the card',
      'The mother sees the rejection on her booking detail and is notified',
    ],
  },
  {
    id: 'admin-time-edit',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    title: 'An operator edits booking times and the preview matches what is applied',
    preconditions: ['A paid, confirmed booking'],
    steps: [
      'Open the booking, change the times to make it longer, and read the preview',
      'Apply the edit',
      'Repeat on another paid booking, this time making it shorter',
    ],
    expected: [
      'The preview shows the price delta before anything is applied',
      'What is applied matches the preview exactly',
      'A longer booking produces a balance for the mother to settle',
      'A shorter booking produces a refund rather than a charge',
    ],
  },
  {
    id: 'parent-settles-adjustment',
    area: 'Payments',
    surface: 'Parent app',
    priority: 'P0',
    title: 'The mother settles the balance after a time edit',
    preconditions: ['A booking an operator lengthened, leaving a balance owed'],
    steps: ['Open the booking on her device', 'Go to the adjustment checkout and pay'],
    expected: [
      'The outstanding amount is shown and matches the operator\'s preview',
      'Paying clears it and the booking shows as settled',
      'The nanny\'s share reflects the longer booking',
    ],
  },
  {
    id: 'admin-refund',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    title: 'An operator refunds a paid booking, partially then fully',
    preconditions: ['A paid, confirmed booking'],
    steps: [
      'Refund part of the amount',
      'Refund the rest',
      'Try to refund more than was paid',
    ],
    expected: [
      'Each refund reaches the card and the refunded total accumulates correctly',
      'The booking shows as refunded once the full amount is returned',
      'Over-refunding is reported as unsuccessful — the console does not crash or double-refund',
      'Any Care Points redeemed on that booking are returned to the wallet',
    ],
  },
  {
    id: 'live-camera-monitor',
    area: 'Care',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'The mother watches the live camera during a shift',
    preconditions: ['A camera created in the console and assigned to the nanny', 'A booking in progress'],
    steps: ['Open the booking on the mother\'s device and open the live monitor'],
    expected: [
      'The monitor opens and connects to the assigned camera',
      'A booking that is not in progress does not offer the monitor',
      'A nanny with no camera assigned shows a clear "no camera" state, not an error',
    ],
  },
  {
    id: 'camera-notify-nanny',
    area: 'Care',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'The mother asks the nanny to switch the camera on',
    preconditions: ['A booking in progress with a camera assigned'],
    steps: ['From the live monitor, send the "turn the camera on" request', 'Check the nanny\'s device'],
    expected: [
      'The nanny receives a push asking her to switch the camera on',
      'The mother is told the request was sent',
    ],
  },
  {
    id: 'webhook-dropped-reconciled',
    area: 'Payments',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'A payment that does not report back is reconciled',
    preconditions: ['A booking being paid'],
    steps: [
      'Complete a card payment and kill the app or lose connectivity before it returns',
      'Reopen the app and open that booking',
    ],
    expected: [
      'The booking ends up confirmed — the payment is reconciled rather than lost',
      'The mother is not asked to pay a second time',
      'The console shows one captured payment, not two',
    ],
  },
  {
    id: 'webhook-duplicate-and-tampered',
    area: 'Payments',
    surface: 'Cross-surface',
    priority: 'P0',
    negative: true,
    title: 'Duplicate payment callbacks are harmless and forged ones are rejected',
    preconditions: ['Access to replay a payment callback against the environment under test'],
    steps: [
      'Replay a genuine payment callback a second time',
      'Send one with an altered signature',
    ],
    expected: [
      'The duplicate changes nothing — one payment, one confirmation, no double charge',
      'The forged one is rejected and the booking is left exactly as it was',
    ],
  },
  {
    id: 'offline-and-recovery',
    area: 'Platform',
    surface: 'Parent app',
    priority: 'P1',
    negative: true,
    title: 'With no connection the app explains itself and recovers',
    preconditions: ['Signed in as a mother'],
    steps: [
      'Put the device into airplane mode',
      'Open Home, the bookings list and the community feed',
      'Turn connectivity back on and pull to refresh',
    ],
    expected: [
      'Each screen shows a readable error state, not a blank screen or a spinner forever',
      'The message says what to do about it',
      'Pulling to refresh once connectivity is back loads the real data',
    ],
  },
  {
    id: 'empty-states',
    area: 'Platform',
    surface: 'Parent app',
    priority: 'P1',
    title: 'Empty states read properly',
    preconditions: ['A brand new account with no bookings, no messages and no notifications'],
    steps: ['Open Activity, the inbox, the notification centre', 'Search the marketplace for something with no matches'],
    expected: [
      'Each shows a purposeful empty state, not a blank screen',
      'The wording tells the user what to do next',
      'No error is shown for a legitimately empty list',
    ],
  },
  {
    id: 'admin-dashboard',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P1',
    title: 'The admin dashboard agrees with the underlying data',
    preconditions: ['An operator with the Dashboard section', 'Known counts of bookings and nannies'],
    steps: [
      'Open the dashboard',
      'Compare each stat card with the corresponding list page',
      'Read the three charts',
    ],
    expected: [
      'Total bookings, awaiting approval, revenue, active nannies, nannies to review and active promo codes all match their list pages',
      'The charts render with sensible axes and labels',
      'Creating a booking and reloading moves the numbers',
    ],
  },
  {
    id: 'admin-users-console',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P1',
    title: 'The users console — both tabs, detail pages, edit, approve and reject',
    preconditions: ['An operator with the Users section'],
    steps: [
      'Open Users and switch between the Mommies and Nannies tabs',
      'Filter and page each tab',
      'Open a mother\'s detail page and edit a field',
      'Open a nanny\'s detail page, edit her profile and change her skills',
    ],
    expected: [
      'Both tabs list the right people with the right status badges',
      'Edits save and are visible on the person\'s device after a refresh',
      'Approving or rejecting from a detail page updates the badge and the list',
      'A rejection reason survives and is shown to the user',
    ],
  },
  {
    id: 'admin-creates-operator',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    title: 'A superuser creates an operator and sets their permissions',
    preconditions: ['Signed in as a superuser'],
    steps: [
      'Create a new operator with an email and password',
      'Grant some sections at manage, some at view-only, and leave others ungranted',
      'Sign out and sign in as that new operator in a separate browser',
    ],
    expected: [
      'The new operator can sign in with the credentials just created',
      'Their sidebar shows exactly the sections granted, in order',
      'They land on the first section they are allowed to open',
    ],
  },
  {
    id: 'operator-section-blocked',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    negative: true,
    title: 'A section an operator does not hold is hidden and unreachable',
    preconditions: ['An operator with at least one section ungranted'],
    steps: [
      'Signed in as that operator, check the sidebar',
      'Type the URL of a forbidden section directly into the address bar',
    ],
    expected: [
      'The forbidden section is absent from the sidebar',
      'The direct URL does not open it — they are bounced or shown "no access"',
      'No data from that section is visible anywhere',
    ],
  },
  {
    id: 'operator-view-only',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    negative: true,
    title: 'A view-only section really is read-only',
    preconditions: ['An operator holding a section at view level only'],
    steps: [
      'Open that section as the view-only operator',
      'Look for create, edit, delete and override controls',
    ],
    expected: [
      'The data is visible',
      'Every write control is absent — for Bookings, the status override column is not rendered at all',
      'There is no way to make a change from the UI',
    ],
  },
  {
    id: 'removed-operator-cannot-sign-in',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P0',
    negative: true,
    title: 'A removed operator can no longer sign in',
    preconditions: ['An operator account that can currently sign in'],
    steps: [
      'As a superuser, delete that operator',
      'Try to sign in as them in a fresh browser',
      'If they had a session open, reload their page',
    ],
    expected: [
      'Sign-in is refused at the door — the account no longer authenticates',
      'An open session cannot keep working',
    ],
  },
  {
    id: 'catalogue-skills',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'Nanny Skills — a new skill reaches the app, an inactive one does not',
    preconditions: ['An operator with the Nanny Skills section'],
    steps: [
      'Create a new active skill with a distinctive name and a fee',
      'Create a second one and mark it inactive',
      'On the nanny app, open profile editing; on the parent app, start a booking',
    ],
    expected: [
      'The active skill is selectable by a nanny and requestable by a mother',
      'The inactive one appears nowhere in either app',
      'Selecting the skill on a booking adds its fee to the total',
      'Editing and deleting a skill both work and are reflected in the apps',
    ],
  },
  {
    id: 'catalogue-packages',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'Packages — a new package reaches the app and its purchase reaches the ledger',
    preconditions: ['An operator with the Packages section'],
    steps: [
      'Create a package with a distinctive name, hours, price and validity',
      'Buy it on the parent app',
      'Open package purchases in the console and open the purchase',
    ],
    expected: [
      'The new package is offered in the app with the values entered',
      'The purchase is listed in the console against the right mother',
      'The ledger shows the hours credited and, after a booking, the hours consumed',
      'Editing the package does not change already-purchased hours',
    ],
  },
  {
    id: 'catalogue-promos-campaigns-certs',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P1',
    title: 'Promo codes, campaigns and certifications reach the app',
    preconditions: ['An operator holding those sections'],
    steps: [
      'Create a promo code and use it on a booking',
      'Create a campaign with an image, pointing at that promo code, and make it live',
      'Open the parent Home screen and tap the campaign card',
      'Create a certification and check it is offered to a nanny',
    ],
    expected: [
      'The campaign appears in the Home carousel with its image',
      'Tapping it opens the booking flow with the promo code already applied (or the package checkout, for a package campaign)',
      'The campaign\'s impression and tap counts go up in the console',
      'The new certification is selectable on a nanny\'s profile',
      'Deleting a campaign removes it from the carousel',
    ],
  },
  {
    id: 'config-reaches-the-app',
    area: 'Admin',
    surface: 'Cross-surface',
    priority: 'P0',
    title: 'Booking options, pricing and rewards configuration reach the app',
    preconditions: ['An operator holding Booking Options, Pricing & Fees and Care Points'],
    steps: [
      'Change the booking window, the min/max hours and the broadcast radius; check the booking picker on the app',
      'Change the hourly rate, the service fee and the nanny/platform split; price a booking in the console calculator and then make the same booking in the app',
      'Add a duration rule and book a duration that triggers it',
      'Change the Care Points earn rate, then grant points to a wallet and check the wallet history',
      'Set the support channels and check the Help screen',
    ],
    expected: [
      'Every change is visible in the app after a refresh, with no app release',
      'The console calculator and the real booking total agree to the currency unit',
      'The duration rule discount is applied at the right threshold',
      'Granted points appear in the mother\'s balance and in the wallet history',
      'Restore the original values afterwards — this configuration is global',
    ],
  },
  {
    id: 'catalogue-cameras',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P2',
    title: 'Cameras — create, assign to a nanny, edit and delete',
    preconditions: ['An operator with the Cameras section'],
    steps: [
      'Create a camera with a name and stream URL and assign it to a nanny',
      'Edit it, then reassign it to a different nanny',
      'Delete it',
    ],
    expected: [
      'The camera is listed against the nanny it is assigned to',
      'Reassigning moves it, and the previous nanny\'s bookings no longer resolve to it',
      'Deleting removes it and the live monitor shows the "no camera" state',
    ],
  },
  {
    id: 'admin-session-lifecycle',
    area: 'Admin',
    surface: 'Admin console',
    priority: 'P1',
    title: 'The console session — long sessions, sign-out and deep links',
    preconditions: ['An operator account'],
    steps: [
      'Sign in and leave the console open for over an hour, then use it',
      'Sign out and try to go back with the browser back button',
      'While signed out, open a deep link to a protected page',
    ],
    expected: [
      'After an hour the console still works — the session refreshes without a forced sign-in',
      'After signing out, the back button does not restore the console',
      'The deep link sends them to sign-in and then on to the page they asked for',
    ],
  },
];

/**
 * Every scenario, ordered by how often it happens in production. The display
 * number is the index + 1.
 */
export const QA_SCENARIOS: readonly QaScenario[] = [
  ...TIER_A,
  ...TIER_B,
  ...TIER_C,
  ...TIER_D,
];

/** Fast membership test — the backend uses this as its write allowlist. */
export const QA_SCENARIO_IDS: ReadonlySet<string> = new Set(QA_SCENARIOS.map((s) => s.id));

export function isQaScenarioId(id: string): boolean {
  return QA_SCENARIO_IDS.has(id);
}
