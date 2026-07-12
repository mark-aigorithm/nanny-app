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
- **Spacing:** horizontal screen padding `spacing.xl`–`2xl` (20–24). Prefer `gap` between stacked items (`spacing.md`/`2xl`) over per-child margins.
- **Shadows:** `shadows.sm` for cards (default), `md` for the primary button, higher tiers rarely.

## Reuse-first component flow

Before writing a `View`/`Pressable` with styles, check `@mobile/components/ui`:

```
Building a…
  full-width CTA / action button   → <Button variant="primary|secondary|outline|text|destructive">
  white content container          → <Card>            (shadow + radius baked in)
  filter pill / tag                → <Chip active>
  icon in a colored circle         → <IconCircle>      (defaults to sage tint)
  screen wrapper                   → <ScreenContainer> (SafeArea + cream bg + StatusBar)
  "Title + See all" row            → <SectionHeader>
  search field, avatar, badge,     → SearchBar / Avatar / Badge / Header / Divider
  header, or divider
```

Only build a bespoke element when nothing above fits. When you do, mirror the existing recipe: `colors.surface` background, `borderRadius.lg`/`xl`, `...shadows.sm`, token spacing — exactly like the cards in `screens/*/styles/*.styles.ts`.

## Building a new screen

1. Wrap in `<ScreenContainer>` (gets the cream background + safe area for free).
2. Put the `StyleSheet.create` block in a dedicated `screens/<area>/styles/<name>.styles.ts` file importing only from `@mobile/theme`.
3. Compose from `@mobile/components/ui` first; reach for raw views only for layout.
4. Use `gap`-based vertical rhythm; scroll content padded with `spacing['3xl']` at the bottom.
5. One sage accent per screen; everything else warm-neutral. Let whitespace carry the design.

## Common mistakes

- Hardcoding a hex/font/shadow instead of a token — breaks the CLAUDE.md rules and drifts the palette.
- Inventing an off-palette color (a new gray, a brighter green) to fill a gap — pick the closest existing token instead.
- Rebuilding a Button/Card/Chip inline instead of importing it.
- Flat, sharp, high-contrast "Material" styling — this app is soft and warm.
- Leaving styles inline in the screen file instead of the `.styles.ts` sibling.

## Verify visually

After building UI, confirm it looks right using the **Visual Validation Workflow** in `apps/mobile/CLAUDE.md` (build → serve → Playwright screenshot at 390×844 → teardown). Check the result reads as warm/rounded/airy, not just that it compiles.
