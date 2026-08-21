/**
 * The catalogue rows the P0 flows spend: promo codes, a package, Care Points.
 *
 * One place, imported by the runner and handed to the backend's seeding script,
 * so a flow and the row behind it can never disagree — the same contract
 * `accounts.mjs` has for who the lab signs in as.
 *
 * Every name and code is prefixed `E2E` so it is obvious in a database that
 * these belong to the lab and not to a person.
 */

/**
 * Platform settings the lab overrides, and why each one is not incidental:
 *
 * - **No lead time.** A11's gate and A1's check-in both need a booking that
 *   starts *now*: check-in opens 15 minutes before the start time, and the
 *   default two-hour notice puts every bookable slot outside that window, so
 *   no flow could ever reach IN_PROGRESS.
 * - **A 24-hour care window.** `start === end` is the schema's documented
 *   full-day case. The default 06:00–22:00 window would make the whole suite
 *   pass or fail depending on what time of day it ran.
 *
 * Both are ordinary admin-configurable settings, not test-only switches — the
 * lab is running the platform in a legal configuration, not around it.
 */
export const PLATFORM_SETTINGS = {
  min_advance_booking_hours: '0',
  booking_window_start_hour: '0',
  booking_window_end_hour: '0',
};

/**
 * Two codes, because A4 needs both halves of the story: one that keeps working
 * so a flow can be re-run, and one that must be refused the second time.
 */
export const PROMO_CODES = {
  /** Percentage off, unlimited uses — the happy path. */
  reusable: { code: 'E2ETEN', discountType: 'PERCENTAGE', value: 10 },
  /** Single use across all users; the seeder resets its counter every run. */
  singleUse: { code: 'E2EONCE', discountType: 'FLAT', value: 50, maxUsage: 1 },
};

/**
 * Priced at 90/hour against the standard 120, so it is genuinely cheaper —
 * the review step only advertises packages when at least one beats the
 * standard rate, and A6 asserts on that nudge.
 */
export const PACKAGE = {
  name: 'E2E Starter',
  hours: 10,
  price: 900,
  validityDays: 90,
};

/**
 * Ten free hours' worth at the default 100 points per hour — comfortably over
 * `minRedemptionPoints`, so the redemption stepper is never stuck in the dead
 * zone below the program's floor.
 */
export const CARE_POINTS = 1000;
