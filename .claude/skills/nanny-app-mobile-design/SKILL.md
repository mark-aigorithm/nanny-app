---
name: nanny-app-mobile-design
description: Use when building, restyling, or reviewing any NannyApp mobile (Expo/React Native) screen or component — anything touching apps/mobile visual layout, colors, typography, spacing, cards, buttons, or chips, so new UI looks native to the app.
---

# NannyApp Mobile Design Language

## Overview

NannyApp's mobile UI has a specific look: **warm, calm, soft, and rounded** — a sage-and-taupe palette on a cream background, Manrope type, gentle shadows, and pill-shaped controls. New UI must feel like it already lived in the app. This skill captures that aesthetic and the workflow to match it.

**Core principle:** Reuse before you build, and token before you type a value. Every visual choice already has an answer in `@mobile/theme` or `@mobile/components/ui` — find it before inventing.

> The mechanical rules (never hardcode hex/fonts/shadows, style-file structure, full component list) live in `apps/mobile/CLAUDE.md`. This skill is the *aesthetic layer* on top of them — read both.

## Aesthetic DNA

The feeling is a boutique childcare brand, not a tech dashboard. Aim for **warm, airy, editorial, trustworthy**.

| Do | Don't |
|---|---|
| Warm cream/taupe/sage neutrals | Cool grays, pure white fields, neon |
| Generous rounding (14–24px), pill controls | Sharp or 4px corners |
| Soft, low-opacity shadows (`shadows.sm`) | Heavy/dark drop shadows, hard borders |
| Airy spacing, `gap`-based layout | Cramped, dense, edge-to-edge clutter |
| Green as the single accent | Multiple competing bright accents |
| Muted tints for icon backgrounds | Fully saturated fills behind icons |

## Palette at a glance (see `theme/colors.ts` for all tokens)

- **Primary accent:** `colors.primary` `#97a591` (sage) — CTAs, active states, links. Darker `colors.primaryDark`, tint `colors.primaryMuted`.
- **Surfaces:** `colors.background` `#fdfaf8` (canonical cream — never `#fcf9f7`), `colors.surface` white cards, `colors.surfaceMuted` image placeholders.
- **Warm neutrals:** `colors.taupe`, `colors.taupeLight`, `colors.warmBorder`, `colors.surfaceMuted` — chips, dividers, fills.
- **Text:** `colors.textPrimary`/`textDark` (headings), `colors.textSecondary` (body), `colors.textMuted` (meta/placeholder).
- **Semantic:** `colors.success`, `colors.error`, `colors.gold` (ratings). Use sparingly.

**When a token doesn't exist for what you need, pick the closest existing one — do not invent a hex/rgba value.**

## Type & shape at a glance

- **Font:** Manrope only. Headings `...typeScale.headingLg/Md/Sm` (bold). Body `...typeScale.bodyLg/Md`. Labels `...typeScale.labelMd` (semiBold). Never hardcode `'Manrope_700Bold'`.
- **Radii:** buttons & sheets `borderRadius['2xl']` (24), cards `xl` (16) / `lg` (14), chips/search/avatars `full`.
- **Spacing:** horizontal content padding is **`screenPadding` (24) on every screen** — don't drift to `spacing.xl` (20) or `spacing.lg` (16). Prefer `gap` between stacked items (`spacing.md`/`2xl`) over per-child margins.
- **Shadows:** `shadows.sm` for cards (default), `md` for the primary button, higher tiers rarely.

## Screen Layout & Chrome

Every screen is built from the same three parts so they never drift. **Do not hand-roll a
container, `StatusBar`, or header** — the shared primitives own those.

```
<ScreenContainer useSafeArea={false}>       {/* owns background + translucent StatusBar */}
  <ParentTabHeader/> | <NannyTabHeader/>    {/* PRIMARY TABS only: brand identity + bell/avatar */}
    — or —
  <StackHeader title="…" />                 {/* EVERYTHING ELSE: large left-aligned title */}
  <ScrollView contentContainerStyle={content}>
     …                                      {/* horizontal: screenPadding (24) */}
  </ScrollView>                             {/* bottom: clearance token — see table */}
</ScreenContainer>
```

**Which header?**
- **Primary bottom-tab screen** (Home, Community, Messages / nanny Dashboard, Requests, Profile) →
  the brand tab header (`ParentTabHeader` / `NannyTabHeader`), rendered as an absolute overlay
  *after* the scroll view so content scrolls under the status bar.
- **Everything else** — secondary/detail screens *and* the section tabs (Services, Account) →
  `<StackHeader title subtitle? showBackButton? onBack? rightElement? />`. It's a large,
  left-aligned title (iOS large-title style) with an optional back chevron above it, in-flow at
  the top. `showBackButton={false}` for a section tab; pass `onBack` only when back isn't
  `router.back()`. Use `rightElement` for a single trailing control (avatar, "Mark all read").

**Padding & clearance tokens** (from `@mobile/theme`):

| Concern | Value |
|---|---|
| Horizontal content padding | `screenPadding` (24) everywhere |
| Top inset | Owned by the header — **never set `paddingTop: STATUS_BAR_HEIGHT` in a screen** |
| Bottom — parent floating-tab screens | `PARENT_TAB_SCROLL_BOTTOM` |
| Bottom — nanny bottom-nav screens | `BOTTOM_NAV_HEIGHT + spacing.lg` |
| Bottom — plain stack screens (no nav bar) | `spacing['4xl']` (48) — never magic numbers (120/200/…) |

`ScreenContainer` runs with `useSafeArea={false}`: the header owns the top inset and the
clearance tokens own the bottom, so a top safe-area edge would double-pad. Only reach for
`useSafeArea`/`SafeAreaView` when there is no header (e.g. a bottom reply bar needing
`edges={['bottom']}`).

## Reuse-first component flow

Before writing a `View`/`Pressable` with styles, check `@mobile/components/ui`:

```
Building a…
  full-width CTA / action button   → <Button variant="primary|secondary|outline|text|destructive">
  white content container          → <Card>            (shadow + radius baked in)
  filter pill / tag                → <Chip active>
  icon in a colored circle         → <IconCircle>      (defaults to sage tint)
  screen wrapper                   → <ScreenContainer> (cream bg + StatusBar)
  screen title / detail header     → <StackHeader>     (large title; see Screen Layout & Chrome)
  primary-tab header               → <ParentTabHeader> / <NannyTabHeader>
  "Title + See all" in-content row → <SectionHeader>
  search field, avatar, badge,     → SearchBar / Avatar / Badge / Divider
  or divider
```

Only build a bespoke element when nothing above fits. When you do, mirror the existing recipe: `colors.surface` background, `borderRadius.lg`/`xl`, `...shadows.sm`, token spacing — exactly like the cards in `screens/*/styles/*.styles.ts`.

## Building a new screen

1. Wrap in `<ScreenContainer useSafeArea={false}>`, then a header — `StackHeader` for a
   secondary/detail/section screen, or the brand tab header for a primary tab (see
   **Screen Layout & Chrome**).
2. Put the `StyleSheet.create` block in a dedicated `screens/<area>/styles/<name>.styles.ts` file importing only from `@mobile/theme`.
3. Compose from `@mobile/components/ui` first; reach for raw views only for layout.
4. Use `gap`-based vertical rhythm; horizontal padding is `screenPadding`; the bottom uses the
   clearance token that matches the screen's nav (see the padding & clearance table).
5. One sage accent per screen; everything else warm-neutral. Let whitespace carry the design.

## Common mistakes

- Hardcoding a hex/font/shadow instead of a token — breaks the CLAUDE.md rules and drifts the palette.
- Inventing an off-palette color (a new gray, a brighter green) to fill a gap — pick the closest existing token instead.
- Rebuilding a Button/Card/Chip inline instead of importing it.
- Flat, sharp, high-contrast "Material" styling — this app is soft and warm.
- Leaving styles inline in the screen file instead of the `.styles.ts` sibling.
- Hand-rolling a container / `StatusBar` / back-header instead of `ScreenContainer` + a shared header — this is the #1 source of layout drift.
- Padding the bottom with a magic number or `spacing['3xl']` when the screen scrolls under a nav bar — use the clearance token for that nav (see the padding & clearance table).

## Verify visually

After building UI, confirm it looks right using the **Visual Validation Workflow** in `apps/mobile/CLAUDE.md` (build → serve → Playwright screenshot at 390×844 → teardown). Check the result reads as warm/rounded/airy, not just that it compiles.
