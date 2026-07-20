# Packages Mobile — Browse + Purchase + Redeem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent browse prepaid-hour packages, buy one via Paymob, see their remaining hours (with expiries), and have those hours + free-skill allowance auto-applied and shown in the booking price breakdown.

**Architecture:** Expo + **expo-router** (file-based; no `RootStackParamList`). TanStack Query hooks over the Axios `api` client (auto-attaches Firebase JWT, unwraps the `{ data, error }` envelope). Package purchase **reuses the existing Paymob WebView checkout** (`buildPaymobCheckoutUrl` + `paymobRedirect` + a package result screen), mirroring the booking payment flow. Redemption is server-side (backend plan Task 6); mobile only surfaces the outcome.

**Tech Stack:** Expo React Native, expo-router, TanStack Query, react-native-webview, Zod types from `@nanny-app/shared`.

## Global Constraints

- **Strict TS, no `any`.** Response/request types come from `@nanny-app/shared` (`PublicPackage`, `PackageHoursBalance`, `PurchasePackageInput`); never redefine them.
- **Screens never contain `StyleSheet.create`** — every screen has a sibling `src/screens/parent/styles/<name>.styles.ts` (per `apps/mobile/CLAUDE.md`).
- **Theme tokens only** — colors/spacing/typography from `@mobile/theme` (`colors`, etc.); no hardcoded hex. Reuse `@mobile/components/ui` (`Card`, `IconCircle`, `Button`).
- **API base + auth** are handled by the shared `api` instance (`src/lib/api.ts`); use `unwrap<T>(api.get/post(...))` and `getApiErrorMessage(err, fallback)` in catches. Never build a new Axios client.
- **Pull-to-refresh** uses `useRefreshByUser` (repo memory `pull-to-refresh-pattern`) — never bind `RefreshControl` to `isRefetching`.
- **Query keys** are namespaced arrays with an exported constant (e.g. `const PACKAGES_KEY = 'packages'`).
- **Money** rendered with `formatMoney` (`src/lib/formatMoney.ts`); hours as `${n}h`.
- **Verification** (repo memory `local-dev-constraints`: no mobile Jest harness): gate every task on `pnpm typecheck`; verify UI via the Browser-pane preview where a screen renders. No `.test.tsx` for these screens.

---

## File Structure

- `apps/mobile/src/hooks/usePackages.ts` — catalog query, balance query, purchase mutation (Task 1).
- `apps/mobile/src/screens/parent/PackagesScreen.tsx` + `styles/packages-screen.styles.ts` + `app/(parent)/packages.tsx` — catalog (Task 2).
- `apps/mobile/src/lib/packagePurchaseDraft.ts`, `screens/parent/PackageCheckoutScreen.tsx`, `PackagePaymentResultScreen.tsx` + route files under `app/(parent)/packages/` (Task 3).
- `apps/mobile/src/screens/parent/PackageHoursScreen.tsx` + styles + `app/(parent)/package-hours.tsx` (Task 4).
- `apps/mobile/src/screens/parent/BookingDetailScreen.tsx` — add prepaid-hours line (Task 5).
- `apps/mobile/app/(parent)/_layout.tsx`, `app/(parent)/packages/_layout.tsx` — route registration (Task 6).

---

### Task 1: Data hooks — catalog, balance, purchase

**Files:**
- Create: `apps/mobile/src/hooks/usePackages.ts`

**Interfaces:**
- Consumes: `api`, `unwrap` from `@mobile/lib/api`; types `PublicPackage`, `PackageHoursBalance`, `PurchasePackageInput`, plus the purchase-session shape from the backend (`{ paymentId, clientSecret, publicKey, intentionId }` — same as `PaymobCheckoutSession`).
- Produces: `usePackages()`, `usePackageHours()`, `usePurchasePackage()`, exported `PACKAGES_KEY`, `PACKAGE_HOURS_KEY`.

- [ ] **Step 1: Implement the hooks** (mirror `useRewards.ts` + `useBookings.ts`):
```ts
import type { PackageHoursBalance, PublicPackage } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, unwrap } from '@mobile/lib/api';

export const PACKAGES_KEY = 'packages';
export const PACKAGE_HOURS_KEY = 'package-hours';

export type PackageCheckoutSession = {
  paymentId: number; clientSecret: string; publicKey: string; intentionId: string;
};

export function usePackages() {
  return useQuery({
    queryKey: [PACKAGES_KEY, 'list'],
    queryFn: () => unwrap<PublicPackage[]>(api.get('/packages')),
  });
}

export function usePackageHours() {
  return useQuery({
    queryKey: [PACKAGE_HOURS_KEY],
    queryFn: () => unwrap<PackageHoursBalance>(api.get('/packages/me/hours')),
  });
}

export function usePurchasePackage() {
  const qc = useQueryClient();
  return useMutation<PackageCheckoutSession, Error, { packageId: number }>({
    mutationFn: ({ packageId }) =>
      unwrap(api.post(`/packages/${packageId}/purchase`, { packageId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: [PACKAGE_HOURS_KEY] }),
  });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`  → Expected: PASS.
```bash
git add apps/mobile/src/hooks/usePackages.ts
git commit -m "feat(mobile): packages catalog, hours-balance, and purchase hooks"
```

---

### Task 2: Packages catalog screen

**Files:**
- Create: `apps/mobile/src/screens/parent/PackagesScreen.tsx`
- Create: `apps/mobile/src/screens/parent/styles/packages-screen.styles.ts`
- Create: `apps/mobile/app/(parent)/packages.tsx`

**Interfaces:**
- Consumes: `usePackages`, `usePackageHours` (Task 1), `useRefreshByUser`.

- [ ] **Step 1: Build the screen** (template: `RewardsScreen.tsx` — `ScrollView` + `RefreshControl` + loading/error/empty + mapped cards). Each package card shows name, `${hours}h`, `formatMoney(price)`, "valid {validityDays} days", "{maxSkills} free skills", and a **Buy** `Button` that navigates to checkout:
```tsx
import { router } from 'expo-router';
// ...
<Button
  label={`Buy · ${formatMoney(pkg.price)}`}
  onPress={() =>
    router.push({ pathname: '/(parent)/packages/checkout', params: { packageId: String(pkg.id) } } as never)
  }
/>
```
Show a small header card with `usePackageHours().data?.availableHours` ("You have {n}h prepaid") linking to the hours screen. Render `packages.isLoading` → `ActivityIndicator`; `packages.isError` → error text via `getApiErrorMessage`; empty → an empty `Card`.

> **Single-active-package rule:** a parent may only hold one active package (backend enforces a 409 on a second purchase). Derive `hasActivePackage` from `usePackageHours()` (any bucket with `status === 'ACTIVE'` and `hoursRemaining > 0`). When true, **disable every Buy button** and show a banner ("You have an active package — use it up or wait for it to expire before buying another"). Still surface the backend 409 via `getApiErrorMessage` in the checkout mutation catch as a safety net.

- [ ] **Step 2: Styles file** — `packages-screen.styles.ts` with `StyleSheet.create`, theme tokens only.

- [ ] **Step 3: Route file** `app/(parent)/packages.tsx`:
```ts
import PackagesScreen from '@mobile/screens/parent/PackagesScreen';
export default PackagesScreen;
```

- [ ] **Step 4: Typecheck + preview**

Run: `pnpm typecheck`. Then open the Browser-pane preview (Expo web) at the `/(parent)/packages` route; confirm cards render and Buy navigates. Commit:
```bash
git add apps/mobile/src/screens/parent/PackagesScreen.tsx apps/mobile/src/screens/parent/styles/packages-screen.styles.ts apps/mobile/app/(parent)/packages.tsx
git commit -m "feat(mobile): packages catalog screen"
```

---

### Task 3: Purchase checkout (Paymob WebView) + result

**Files:**
- Create: `apps/mobile/src/lib/packagePurchaseDraft.ts` (param helpers, mirrors `bookingDraft.ts`)
- Create: `apps/mobile/src/screens/parent/PackageCheckoutScreen.tsx`
- Create: `apps/mobile/src/screens/parent/PackagePaymentResultScreen.tsx`
- Create: `apps/mobile/app/(parent)/packages/checkout.tsx`, `app/(parent)/packages/payment-result.tsx`, `app/(parent)/packages/_layout.tsx`

**Interfaces:**
- Consumes: `usePurchasePackage`, `usePackageHours` (Task 1); `buildPaymobCheckoutUrl` (`src/lib/paymobCheckout.ts`); `isPaymobPaymentRedirect` (`src/lib/paymobRedirect.ts`); the `CHECKOUT_VIEWPORT_FIX` injected JS + WebView handlers from `BookingStep3Screen.tsx` (copy verbatim).

- [ ] **Step 1: Checkout screen** — read `useLocalSearchParams<{ packageId: string }>()`, on mount call `usePurchasePackage().mutateAsync({ packageId: Number(packageId) })`, then `setCheckoutUrl(buildPaymobCheckoutUrl(session.publicKey, session.clientSecret))` and render `<WebView source={{ uri: checkoutUrl }} injectedJavaScript={CHECKOUT_VIEWPORT_FIX} onNavigationStateChange={...} onShouldStartLoadWithRequest={Platform.OS === 'android' ? ... : undefined} />`. In the redirect handler, use `isPaymobPaymentRedirect(url)`; on a terminal result `router.replace({ pathname: '/(parent)/packages/payment-result', params: { packageId } } as never)`. Copy the iOS/Android handler split + comments from `BookingStep3Screen.tsx:645-660` verbatim.

- [ ] **Step 2: Result screen** — poll `usePackageHours()` (via `refetch`) after landing; resolve **success** when `availableHours` increased or the pending bucket for this purchase flips to `ACTIVE`; show a success card ("50 hours added — valid until …") with a "View my hours" button → `router.replace('/(parent)/package-hours')`. On failure show a retry button → back to `checkout`. Reuse the 12s/10s timeout guards from `BookingPaymentResultScreen.tsx` so the user is never trapped.
> Simplest reliable success signal: snapshot `availableHours` before checkout in `packagePurchaseDraft.ts`, compare after. Backend hours only credit once the Paymob webhook/sync marks the payment CAPTURED, so poll `refetch` a few times (reuse the result-screen polling pattern).

- [ ] **Step 3: Nested stack layout** `app/(parent)/packages/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';
export default function PackagesFlowLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
Plus the two 3-line route re-export files.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`. Commit:
```bash
git add apps/mobile/src/lib/packagePurchaseDraft.ts apps/mobile/src/screens/parent/PackageCheckoutScreen.tsx apps/mobile/src/screens/parent/PackagePaymentResultScreen.tsx apps/mobile/app/(parent)/packages
git commit -m "feat(mobile): package purchase Paymob checkout + payment result"
```

---

### Task 4: "My Hours" balance screen

**Files:**
- Create: `apps/mobile/src/screens/parent/PackageHoursScreen.tsx` + `styles/package-hours-screen.styles.ts`
- Create: `apps/mobile/app/(parent)/package-hours.tsx`

**Interfaces:**
- Consumes: `usePackageHours` (Task 1), `useRefreshByUser`.

- [ ] **Step 1: Build the screen** (template `RewardsScreen.tsx`): a hero `Card` showing `data.availableHours` ("{n}h available"), then map `data.buckets` to rows — each showing `packageName`, `hoursRemaining` of `hoursPurchased`, status chip, and "expires {formatted expiresAt}". Loading/error/empty states as in RewardsScreen. Pull-to-refresh via `useRefreshByUser(() => hours.refetch())`.

- [ ] **Step 2: Styles + route file** (`app/(parent)/package-hours.tsx` 3-line re-export).

- [ ] **Step 3: Typecheck + preview + commit**

Run: `pnpm typecheck`; preview the `/(parent)/package-hours` route. Commit:
```bash
git add apps/mobile/src/screens/parent/PackageHoursScreen.tsx apps/mobile/src/screens/parent/styles/package-hours-screen.styles.ts apps/mobile/app/(parent)/package-hours.tsx
git commit -m "feat(mobile): prepaid package hours balance screen"
```

---

### Task 5: Show prepaid-hours coverage in the booking breakdown

**Files:**
- Modify: `apps/mobile/src/screens/parent/BookingDetailScreen.tsx` (Payment Summary block ~193-244)

**Interfaces:**
- Consumes: the backend `Booking` DTO's new `packageHoursApplied`, `packageSkillsCovered`, `packageCreditAmount` (from `@nanny-app/shared` booking type — confirm the mobile booking type includes them after backend Task 6/shared update).

- [ ] **Step 1: Add a conditional payment row**, following the Care Points precedent (`BookingDetailScreen.tsx:219`):
```tsx
{booking.packageHoursApplied > 0 && (
  <View style={styles.paymentRow}>
    <Text style={styles.paymentLabel}>
      Prepaid hours · {booking.packageHoursApplied}h
      {booking.packageSkillsCovered > 0 ? ` + ${booking.packageSkillsCovered} free skills` : ''}
    </Text>
    <Text style={styles.paymentDiscount}>–{formatMoney(booking.packageCreditAmount)}</Text>
  </View>
)}
```
Because the backend folds `packageCreditAmount` into `discountAmount` (like reward credit), split it back out client-side where the promo line is computed (`BookingDetailScreen.tsx:~126-129`): subtract both `rewardCreditAmount` and `packageCreditAmount` when deriving `promoDiscount`.

- [ ] **Step 2: Typecheck + preview + commit**

Run: `pnpm typecheck`; preview a booking detail with prepaid hours applied. Commit:
```bash
git add apps/mobile/src/screens/parent/BookingDetailScreen.tsx
git commit -m "feat(mobile): show prepaid-hours + free-skills coverage in booking breakdown"
```

---

### Task 6: Navigation registration

**Files:**
- Modify: `apps/mobile/app/(parent)/_layout.tsx`

- [ ] **Step 1: Register the new parent screens** as `<Tabs.Screen>` entries (tab bar is hidden; this just registers routes for imperative `router.push`):
```tsx
<Tabs.Screen name="packages" options={{ headerShown: false }} />
<Tabs.Screen name="package-hours" options={{ headerShown: false }} />
```
The `packages/` nested flow (checkout, payment-result) is registered by its own `_layout.tsx` from Task 3 — no entry needed here.

- [ ] **Step 2: Add an entry point** — add a "Buy hours" / "Prepaid packages" nav item wherever the parent menu/home surfaces other destinations (e.g. the same list that links to `rewards`), navigating to `/(parent)/packages`. Find the existing rewards entry point and mirror it.

- [ ] **Step 3: Typecheck + preview + commit**

Run: `pnpm typecheck`; from the parent home, navigate to packages → buy → hours end to end in preview. Commit:
```bash
git add apps/mobile/app/(parent)/_layout.tsx
git commit -m "feat(mobile): register packages + package-hours routes and entry point"
```

---

## Self-Review Notes
- Spec §5 mobile (browse → purchase → my-hours → breakdown) → Tasks 1–6. All covered.
- **Depends on the backend plan** shipping first: routes `GET /packages`, `POST /packages/:id/purchase`, `GET /packages/me/hours`, and the `Booking` DTO gaining `package*` fields. Do not start before backend Tasks 2–7 are merged (shared types must exist).
- No Jest for these screens (repo memory `local-dev-constraints`); each task is gated on `pnpm typecheck` + a preview render, matching how mobile work is verified in this repo.
- Purchase reuses the proven Paymob WebView + redirect helpers verbatim — the highest-risk area is the iOS/Android `onShouldStartLoadWithRequest` split; copy it exactly from `BookingStep3Screen.tsx`.
