import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Children — the family a booking is actually for.
//
// A mother saves her children once and every later booking is
// prefilled from that set; each booking then stores its OWN
// id-less snapshot, so editing or removing a child never rewrites
// the history of a booking that already happened. This module
// imports nothing internal so booking.ts, auth.ts and admin.ts can
// all consume it without an import cycle.
// ──────────────────────────────────────────────────────────────

/**
 * Age in whole years, as the booking flow asks for it. 0 means "under 1" —
 * the mobile picker's `<1` option — and 17 is the ceiling because anyone older
 * isn't who a nanny is being booked for.
 */
export const ChildAgeYearsSchema = z.number().int().min(0).max(17);

/**
 * A child as a booking records them: no id, because this is a snapshot. The
 * name is optional — a mother booking in a hurry gives ages and nothing else,
 * and demanding a name for a price calculation would be theatre.
 */
export const BookingChildSchema = z.object({
  name: z.string().trim().max(80).nullable().default(null),
  ageYears: ChildAgeYearsSchema,
});
export type BookingChild = z.infer<typeof BookingChildSchema>;

/** A child saved on the mother's profile, used to prefill her next booking. */
export const ChildSchema = BookingChildSchema.extend({
  id: z.number().int(),
  createdAt: z.string(),
});
export type Child = z.infer<typeof ChildSchema>;

/**
 * Body for PUT /auth/children — the mother's complete set, replacing whatever
 * is stored. Replace-all rather than per-row CRUD because that is exactly what
 * the booking sheet means when it says "save for next booking": this is my
 * family now. An empty array is legal and clears the saved set.
 */
export const SaveChildrenSchema = z.object({
  children: z.array(BookingChildSchema).max(20),
});
export type SaveChildrenRequest = z.infer<typeof SaveChildrenSchema>;

/** "<1 yr" / "3 yrs" — one phrasing shared by mobile and admin. */
export function formatChildAge(ageYears: number): string {
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
