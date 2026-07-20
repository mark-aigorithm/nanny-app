# Admin-Configurable Support Contact — Design

**Date:** 2026-07-20
**Status:** Approved

## Problem

Parents have no working way to reach support from the app. The parent
`CustomerSupportScreen` already has an "Other ways to reach us" section, but two of
its cards are dead: "Email support" is a `Pressable` with no `onPress`, and
"Emergency assistance / 24/7 safety hotline" is a plain `View` with no number
attached. Support contact details also change over time (new lines, new
providers), so they must be editable by operations without a mobile release.

## Goals

- Parents can reach support by WhatsApp, phone, or email from the existing support screen.
- All three contact values are editable by an admin, with no deploy required.
- A channel the admin has not configured is invisible to users — never a dead button.

## Non-Goals

- Nanny-side support access. The nanny app has no support screen today and is out of scope.
- Changing the "Emergency assistance" card. It stays decorative.
- Replacing the hardcoded `MOCK_FAQS` content on the support screen.
- In-app chat, ticketing, or any support channel beyond deep links.

## Approach

Support contact is modelled as its own concern, separate from `PlatformConfig`.

`getPlatformConfig()` parses every value with `parseFloat` and drops `NaN`, so the
platform config is numeric-only by construction, and that same loop feeds booking
pricing and booking-window enforcement. Adding three strings to it would mean
making the parse loop type-aware and turning `PlatformConfig` into a mixed-type
record — changing booking-critical code to carry values that have nothing to do
with booking. Instead, support contact gets its own service, schema, and
endpoints. It shares only the `app_settings` storage table.

## Data Model

No schema migration. Three new rows in the existing `app_settings` key-value table:

| Key | Example value |
|---|---|
| `support_whatsapp_number` | `+201001234567` |
| `support_phone_number` | `+201001234567` |
| `support_email` | `support@nannynow.com` |

Empty string means "not configured". Defaults are empty for all three, so nothing
ships pointing at a placeholder or dead line — channels appear only once an admin
fills them in.

Phone and WhatsApp numbers are normalized by `updateSupportContact` before the
upsert — whitespace and dashes stripped, a leading `+` preserved — so the admin
can paste a number in any readable format and what lands in the table is
canonical. One stored value then works for both the `tel:` and `wa.me` forms, and
readers never need to normalize.

## Shared Schema

New domain file `packages/shared/src/support.ts`, re-exported from `index.ts`.

Each field is **either an empty string or valid** — empty must stay explicitly
allowed so an admin can retire a channel.

```ts
/** Optional leading '+', then 7–15 digits, once spaces and dashes are stripped. */
const phone = z.string().refine(
  (v) => v === '' || /^\+?\d{7,15}$/.test(v.replace(/[\s-]/g, '')),
  'Enter a valid phone number, or leave blank to hide this channel.',
);

export const SupportContactSchema = z.object({
  whatsappNumber: phone,
  phoneNumber: phone,
  email: z.union([z.literal(''), z.string().email()]),
});
export type SupportContact = z.infer<typeof SupportContactSchema>;

export const UpdateSupportContactSchema = SupportContactSchema.partial();
export type UpdateSupportContactInput = z.infer<typeof UpdateSupportContactSchema>;
```

Note the schema **accepts** spaces and dashes but does not strip them —
normalization is a write-side concern and belongs in the service (see below), so
that validation stays a pure predicate usable by both admin and backend.

The file also exports a `whatsappLink(number: string): string` helper returning
`https://wa.me/<digits>`, so admin and mobile construct the same URL. Digits only
— `wa.me` rejects the `+` and any separators.

## Backend

New `apps/backend/src/services/support-contact.service.ts`, mirroring the shape of
`app-settings.service.ts` but reading values as raw trimmed strings with no
numeric parsing:

```ts
export async function getSupportContact(): Promise<SupportContact>
export async function updateSupportContact(input: UpdateSupportContactInput): Promise<SupportContact>
```

`getSupportContact` reads the three keys where `deletedAt: null` and falls back to
empty strings for unseeded keys. `updateSupportContact` upserts only the provided
fields inside a `prisma.$transaction`, setting `deletedAt: null` on update, then
returns the full resulting contact — the same pattern as `updatePlatformConfig`.
There are no cross-field rules, so there is no `assertCoherent` equivalent.

### Routes

On the existing `adminRouter` (already gated by `requireAuth, requireAdmin`):

- `GET /admin/support-contact` → `getSupportContact()`
- `PUT /admin/support-contact` → `validateBody(UpdateSupportContactSchema)` → `updateSupportContact()`

New `apps/backend/src/routes/support.routes.ts`, mounted at `/support`, gated by
`requireAuth` only:

- `GET /support/contact` → `getSupportContact()`

This narrow projection follows the `GET /bookings/options` and `GET /rewards/config`
precedent: the mobile app never reads `/admin/config` or any admin endpoint.
Because the support contact is exactly the three values the client needs, the
projection is the full object — but it stays a distinct, non-admin route.

Handlers are thin, delegate to the service, and return the `ok()` envelope.

## Admin UI

A third `Card`, "Support contact", appended to `apps/admin/src/pages/settings-page.tsx`
below the existing Booking Options and Matching sections. No new route, no new nav item.

It has its **own** `useQuery` / `useState` / `useMutation` against the new endpoint
and does not join the page's existing `SettingsKey` union or `ConfigField` array.
Those render `type="number"` inputs; keeping the new section separate means the
numeric renderer stays untouched.

Three `<Field>` text inputs — WhatsApp number, support phone number, support email
— each with a hint noting that leaving it blank hides that channel in the app.
Validation runs client-side through `UpdateSupportContactSchema.safeParse` before
submit, matching how the page already validates. On success:
`queryClient.setQueryData` + `toast.success`, consistent with the existing sections.

## Mobile

New hook `apps/mobile/src/hooks/useSupport.ts`:

```ts
export function useSupportContact() {
  return useQuery<SupportContact>({
    queryKey: ['support-contact'],
    queryFn: () => unwrap(api.get('/support/contact')),
    staleTime: 5 * 60_000,
  });
}
```

`CustomerSupportScreen.tsx` renders up to four cards in the existing `contactGrid`,
filtering out any channel whose value is empty:

| Card | Action |
|---|---|
| WhatsApp | `Linking.openURL(whatsappLink(whatsappNumber))` |
| Call support | `Linking.openURL('tel:' + phoneNumber)` |
| Email support | `Linking.openURL('mailto:' + email)` — wires up the currently dead card |
| Ask the community | `router.push('/(parent)/community')` — unchanged, always shown |

`https://wa.me/…` is used rather than `whatsapp://` so the link degrades to the
browser or app store when WhatsApp is not installed, instead of failing silently.

Every `openURL` call is wrapped so a rejected promise surfaces a message rather
than crashing — following the existing `Linking` usage in `ParentNannyContactCard.tsx`.

While the query is loading or if it errors, only the community card renders. No
spinner and no layout placeholder, so the section does not jump.

Styles go in the existing `styles/customer-support-screen.styles.ts`, reusing the
`contactCard` / `contactIconWrap*` tokens already defined there. Any new icon
colors come from existing `colors` tokens — no new tokens.

The "Emergency assistance" card is left exactly as it is.

## Testing

**Backend** (`apps/backend/src/__tests__/`), Prisma mocked:
- `getSupportContact` with no rows seeded returns three empty strings.
- `getSupportContact` returns seeded values and ignores soft-deleted rows.
- `updateSupportContact` writes only the provided fields and leaves others alone.
- `updateSupportContact` accepts an empty string, blanking a channel.
- `updateSupportContact` rejects a malformed number and a malformed email.

**Mobile** (`apps/mobile/src/**/__tests__/`), RNTL with `Linking` mocked:
- A configured channel renders its card and calls `Linking.openURL` with the exact expected URL.
- An unconfigured channel does not render.
- With every channel blank, only "Ask the community" renders.

Both packages enforce an 80% coverage threshold in CI.

## Risks

- **Stale or wrong number.** Because defaults are empty, the failure mode is a
  missing card rather than a card dialing a dead line. Acceptable.
- **Number formatting.** `wa.me` needs bare digits while `tel:` tolerates `+`.
  Centralizing URL construction in the shared `whatsappLink` helper keeps the two
  from drifting.
