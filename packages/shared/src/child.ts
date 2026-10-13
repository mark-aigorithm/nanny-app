import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Children — the family a booking is actually for.
//
// A mother keeps her children on her profile (Profile → Children)
// and a booking picks from that list; each booking then stores its
// OWN id-less snapshot, so editing or removing a child never
// rewrites the history of a booking that already happened. This
// module imports nothing internal so booking.ts, auth.ts and
// admin.ts can all consume it without an import cycle.
// ──────────────────────────────────────────────────────────────

/**
 * Age in whole years, as a booking records it. 0 means "under 1", and 17 is
 * the ceiling because anyone older isn't who a nanny is being booked for.
 */
export const ChildAgeYearsSchema = z.number().int().min(0).max(17);

/** Months of age shown instead of years while a child is this young. */
export const CHILD_AGE_IN_MONTHS_BELOW = 24;

// ── Preset lists ───────────────────────────────────────────────
// Fixed in the app, each with a free-text "Other" beside it: the presets make
// the common answer one tap, and the free text covers everything they don't.
// Values are stored as the label the mother saw, so a custom entry and a
// preset look the same everywhere they're shown.

export const CHILD_ALLERGY_PRESETS = [
  'Peanuts',
  'Tree nuts',
  'Dairy',
  'Eggs',
  'Gluten',
  'Soy',
  'Fish',
  'Shellfish',
  'Sesame',
  'Pets',
  'Pollen',
  'Insect stings',
] as const;

export const CHILD_CONDITION_PRESETS = [
  'Asthma',
  'Eczema',
  'Epilepsy',
  'Diabetes',
  'Heart condition',
] as const;

export const CHILD_DIET_PRESETS = [
  'Vegetarian',
  'Halal only',
  'No sugar',
  'No fizzy drinks',
  'No junk food',
  'Lactose-free',
] as const;

export const CHILD_INTEREST_PRESETS = [
  'Drawing',
  'Reading',
  'Lego',
  'Puzzles',
  'Music',
  'Dancing',
  'Outdoor play',
  'Sports',
  'Swimming',
  'Pretend play',
  'Cooking',
  'Science',
  'Cartoons',
] as const;

export const CHILD_LANGUAGE_PRESETS = ['Arabic', 'English', 'French', 'German'] as const;

/** One chip: a preset label or the mother's own words. */
const ChildTagSchema = z.string().trim().min(1).max(40);

/**
 * A chip list, deduplicated case-insensitively so tapping "Dairy" and typing
 * "dairy" doesn't show twice. Defaults to [] so snapshots written before the
 * list existed still parse.
 */
const ChildTagListSchema = z
  .array(ChildTagSchema)
  .max(20)
  .default([])
  .transform((tags) => {
    const seen = new Set<string>();
    return tags.filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const ChildNoteSchema = z.string().trim().max(500).nullable().default(null);

// ── Birth month and age ────────────────────────────────────────

/**
 * Month and year of birth, `YYYY-MM`. Saved instead of an age because an age
 * goes stale — a child saved at 3 would still read 3 two years later — and the
 * month (not just the year) is what makes "8 mos" possible for a baby.
 */
export const BirthMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month and year of birth.');

/** "2024-03" → months since January of year 0, for month arithmetic. */
function monthIndex(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

/** `YYYY-MM` for a Date, in UTC — at month granularity the zone barely matters. */
export function toYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Whole months between a birth month and `onYearMonth` (both `YYYY-MM`),
 * counting the birth month itself as 0. Negative when the birth month is later.
 */
export function childAgeInMonths(birthMonth: string, onYearMonth: string): number {
  return monthIndex(onYearMonth) - monthIndex(birthMonth);
}

/** The oldest a child may be, in months — matches ChildAgeYearsSchema's 17. */
export const MAX_CHILD_AGE_MONTHS = 18 * 12 - 1;

/**
 * Age as a booking records it, on the booking's month: whole years, plus the
 * month count while the child is under two (null after that, where months
 * stop mattering to anyone).
 */
export function childAgeOn(
  birthMonth: string,
  onYearMonth: string,
): { ageYears: number; ageMonths: number | null } {
  const months = Math.max(
    0,
    Math.min(MAX_CHILD_AGE_MONTHS, childAgeInMonths(birthMonth, onYearMonth)),
  );
  return {
    ageYears: Math.floor(months / 12),
    ageMonths: months < CHILD_AGE_IN_MONTHS_BELOW ? months : null,
  };
}

// ── The booking snapshot ───────────────────────────────────────

/**
 * A child as a booking records them: no id, because this is a snapshot taken
 * from her profile when the booking is made.
 *
 * `allergies` stays a single string (the chips joined) because app builds from
 * before the chip lists read it that way; every field added since has a
 * default, so snapshots from those builds still parse.
 */
export const BookingChildSchema = z.object({
  /** Null on bookings from builds where the name was optional. */
  name: z.string().trim().max(80).nullable().default(null),
  ageYears: ChildAgeYearsSchema,
  /** Months of age on the booking date, set while the child is under two. */
  ageMonths: z.number().int().min(0).max(CHILD_AGE_IN_MONTHS_BELOW).nullable().default(null),
  /**
   * Anything the nanny must not feed or expose this child to, as one line
   * ("Peanuts, Dairy"). Shown to her as a warning she has to read.
   */
  allergies: z.string().trim().max(300).nullable().default(null),
  /** Medical conditions — part of the same warning as allergies. */
  conditions: ChildTagListSchema,
  /** Medicines and what to do: "Inhaler in the blue bag, two puffs if wheezy". */
  healthNotes: ChildNoteSchema,
  diet: ChildTagListSchema,
  interests: ChildTagListSchema,
  languages: ChildTagListSchema,
  /** Comfort toy, nap habits, what calms them down. */
  notes: ChildNoteSchema,
});
export type BookingChild = z.infer<typeof BookingChildSchema>;

/** True when the nanny has to be warned about this child before she arrives. */
function hasHealthAlert(c: BookingChild): boolean {
  return (
    (c.allergies != null && c.allergies.trim().length > 0) ||
    (c.conditions?.length ?? 0) > 0 ||
    (c.healthNotes != null && c.healthNotes.trim().length > 0)
  );
}

/** Children on this booking with an allergy, a condition or a health note. */
export function childrenWithAllergies(children: readonly BookingChild[]): BookingChild[] {
  return children.filter(hasHealthAlert);
}

/** True when any child on the booking has something the nanny must be warned about. */
export function hasAllergyWarning(children: readonly BookingChild[]): boolean {
  return childrenWithAllergies(children).length > 0;
}

/** "Peanuts, Dairy · Asthma" — one child's allergies and conditions, or ''. */
export function formatHealthLine(child: BookingChild): string {
  return [child.allergies?.trim(), (child.conditions ?? []).join(', ')]
    .filter((s): s is string => !!s)
    .join(' · ');
}

/**
 * "Lina: Peanuts · Omar: Dairy · Asthma" — the warning line the nanny reads.
 *
 * Falls back to the age when there's no name, because this string is also
 * shown in the open requests pool, where names are withheld. Safety
 * information travels; identity does not.
 */
export function formatAllergySummary(children: readonly BookingChild[]): string {
  return childrenWithAllergies(children)
    .map((c) => {
      const who = c.name?.trim() || formatChildAge(c.ageYears, c.ageMonths);
      return `${who}: ${formatHealthLine(c) || 'see health notes'}`;
    })
    .join(' · ');
}

// ── The saved child (Profile → Children) ───────────────────────

/** A child saved on the mother's profile, as GET /children returns it. */
export const ChildSchema = z.object({
  id: z.number().int(),
  /** Null only on children saved before the name was required. */
  name: z.string().nullable(),
  /** Null only on children saved as a bare age, before birth months. */
  birthMonth: BirthMonthSchema.nullable(),
  /** Age today — from birthMonth, or the stored age on old rows. */
  ageYears: ChildAgeYearsSchema,
  /** Months today while under two; null otherwise or when unknown. */
  ageMonths: z.number().int().nullable(),
  allergies: z.array(z.string()),
  conditions: z.array(z.string()),
  healthNotes: z.string().nullable(),
  diet: z.array(z.string()),
  interests: z.array(z.string()),
  languages: z.array(z.string()),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type Child = z.infer<typeof ChildSchema>;

/**
 * Body for POST /children and PUT /children/:id. Name and birth month are
 * required; everything else is optional.
 *
 * The birth month is checked against today, not just its format: a month in
 * the future, or more than 17 years back, isn't a child a nanny is booked for.
 */
export const ChildInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Add the child’s name.').max(80),
    birthMonth: BirthMonthSchema,
    allergies: ChildTagListSchema,
    conditions: ChildTagListSchema,
    healthNotes: ChildNoteSchema,
    diet: ChildTagListSchema,
    interests: ChildTagListSchema,
    languages: ChildTagListSchema,
    notes: ChildNoteSchema,
  })
  .superRefine((v, ctx) => {
    const months = childAgeInMonths(v.birthMonth, toYearMonth(new Date()));
    if (months < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['birthMonth'],
        message: 'The birth month can’t be in the future.',
      });
    } else if (months > MAX_CHILD_AGE_MONTHS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['birthMonth'],
        message: 'Children must be 17 or younger.',
      });
    }
  });
export type ChildInput = z.infer<typeof ChildInputSchema>;

/**
 * A saved child as a booking snapshots them, aged on the booking's month
 * (`YYYY-MM`). Old rows with no birth month keep their stored age.
 */
export function toBookingChild(child: Child, onYearMonth: string): BookingChild {
  const age = child.birthMonth
    ? childAgeOn(child.birthMonth, onYearMonth)
    : { ageYears: child.ageYears, ageMonths: null };
  const allergies = child.allergies.join(', ').slice(0, 300);
  return {
    name: child.name,
    ageYears: age.ageYears,
    ageMonths: age.ageMonths,
    allergies: allergies.length > 0 ? allergies : null,
    conditions: child.conditions,
    healthNotes: child.healthNotes,
    diet: child.diet,
    interests: child.interests,
    languages: child.languages,
    notes: child.notes,
  };
}

/** What a saved child still needs before it can be booked, or null when ready. */
export function childMissingForBooking(child: Child): 'name' | 'birthMonth' | null {
  if (!child.name?.trim()) return 'name';
  if (!child.birthMonth) return 'birthMonth';
  return null;
}

// ── Legacy: /auth/children ─────────────────────────────────────

/**
 * Body for PUT /auth/children, which app builds from before Profile → Children
 * send from the booking sheet's "save for next booking" toggle. The server now
 * only ADDS the children she doesn't already have — it never deletes or
 * overwrites, so an old build can't wipe what a newer one saved.
 */
export const SaveChildrenSchema = z.object({
  children: z.array(BookingChildSchema).max(20),
});
export type SaveChildrenRequest = z.infer<typeof SaveChildrenSchema>;

/**
 * The shape GET /auth/children has always returned, kept for those builds:
 * allergies as one string, an age in years, no chip lists.
 */
export type LegacyChild = {
  id: number;
  name: string | null;
  ageYears: number;
  allergies: string | null;
  createdAt: string;
};

// ── Formatting ─────────────────────────────────────────────────

/**
 * "<1 yr" / "3 yrs" — or, while a baby is under two and the months are known,
 * "8 mos" / "1 mo" / "<1 mo". One phrasing shared by mobile and admin.
 */
export function formatChildAge(ageYears: number, ageMonths?: number | null): string {
  if (ageMonths != null && ageMonths < CHILD_AGE_IN_MONTHS_BELOW) {
    if (ageMonths <= 0) return '<1 mo';
    return `${ageMonths} mo${ageMonths === 1 ? '' : 's'}`;
  }
  if (ageYears <= 0) return '<1 yr';
  return `${ageYears} yr${ageYears === 1 ? '' : 's'}`;
}

/**
 * "3 children · 2, 4, 7 yrs" — the one-line summary the nanny reads on a
 * broadcast request and the mother reads on her review screen.
 *
 * Names are deliberately omitted: this string is shown in the open requests
 * pool, before any nanny has claimed the booking, so it must carry what she
 * needs to judge the job and nothing that identifies the family.
 */
export function formatChildrenSummary(children: readonly BookingChild[]): string {
  if (children.length === 0) return 'No children listed';
  const count = `${children.length} child${children.length === 1 ? '' : 'ren'}`;
  const ages = [...children]
    .sort((a, b) => a.ageYears - b.ageYears)
    .map((c) => (c.ageYears <= 0 ? '<1' : String(c.ageYears)))
    .join(', ');
  return `${count} · ${ages} yrs`;
}
