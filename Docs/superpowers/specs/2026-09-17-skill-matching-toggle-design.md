# Skill-matching toggle — design

**Date:** 2026-09-17
**Status:** approved

## Goal

Let an admin turn skill matching off from Booking Options, the way `broadcastRadiusKm = 0`
turns distance matching off. Today the skill match is unconditional: a booking priced with
skill add-ons is only pushed to, listed for, and claimable by nannies holding every one of them.

## Behaviour

One boolean platform setting, `skillMatchingEnabled`, default **true** (no change until an
admin flips it).

When **on** — exactly today's behaviour.

When **off** — the skill requirement is ignored at all three enforcement points in
`booking.service.ts`:

| Point | Function | Effect when off |
|---|---|---|
| Broadcast push | `notifyBookingBroadcast` | every radius-eligible nanny is notified, skills or not |
| Open pool | `listAvailableBookings` | requests with add-ons appear for every nanny |
| Claim | `acceptBooking` | the "needs skills not on your profile" refusal is skipped |

Pricing is untouched: the mother is still charged the add-on fees she selected, and the
snapshot stays on the booking. The admin-facing hint says so, because the consequence of
"off" is that a nanny without the skill can claim work the mother paid a skill surcharge for.

Radius and skill filters are independent — either can be off while the other stays on.

## Storage and API

- `packages/shared/src/admin.ts` — `skillMatchingEnabled: z.boolean()` on
  `PlatformConfigSchema`; flows into `UpdatePlatformConfigSchema` via `.partial()`.
- `app-settings.service.ts` — key `skill_matching_enabled`, stored as the text `'true'` /
  `'false'` (what `String(boolean)` already writes). A new `parse: 'boolean'` `FieldSpec`
  reads it back; anything other than `'false'` reads as `true`, so a corrupt row fails safe
  (matching stays on). Accessor `getSkillMatchingEnabled(): Promise<boolean>`, same
  shape as `getBroadcastRadiusKm`.
- `lib/admin-permissions.ts` — `skillMatchingEnabled: 'settings'` in `CONFIG_KEY_SECTIONS`
  (it lives on Booking Options, next to the radius). `admin-permissions.test.ts` enforces
  the row exists.

## Admin UI (`apps/admin/src/pages/settings-page.tsx`)

- A `Switch` labelled **Match on skills** in the existing "Nanny matching" group, under the
  radius field. Hint: *"Off: nannies without a requested skill are notified and can accept —
  the parent is still charged the add-on."*
- Live-preview line: *"Only nannies with the requested skills are matched"* /
  *"Skills are not checked — any nanny can claim a request"*.
- Form state widens from `Record<key, string>` to numbers-as-strings plus one boolean.
  `SETTINGS_KEYS` stays the single list that drives form, dirty check and payload; the
  toggle is declared alongside so nothing drifts.
- `Switch` is currently duplicated verbatim in `features/rewards/rewards-config-panel.tsx`
  and `features/nannies/nanny-profile-editor.tsx`. It moves to `components/ui/switch.tsx`,
  is exported from the barrel, and both existing users import it — no third copy.

## Tests

- `app-settings.service.test.ts` — default is `true`; `'false'` reads back as `false`;
  round-trips through `updatePlatformConfig`.
- `booking-broadcast-skills.test.ts` — a new describe with the flag mocked off: broadcast
  notifies unskilled nannies, pool shows add-on requests to an unskilled nanny, accept
  succeeds for a nanny missing the skill. Existing cases keep the flag on.
- `admin-permissions.test.ts` — passes once the `CONFIG_KEY_SECTIONS` row is added.
- Admin: `settings-page.test.tsx` — toggling the switch and saving sends
  `skillMatchingEnabled: false`; the preview line flips.

## Out of scope

Per-skill matching flags, soft ranking of skilled nannies, re-notifying nannies when the
setting changes (same as the radius today).
