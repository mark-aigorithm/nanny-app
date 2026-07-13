---
name: nanny-app-admin-design
description: Use when building, restyling, or reviewing any NannyNow admin web app (apps/admin — React + Vite) screen or component — anything touching admin visual layout, colors, typography, tables, forms, filters, menus, modals, toasts, loading/error states, or dashboard reporting, so new UI looks native to the admin console.
---

# NannyNow Admin Design Language

## Overview

The admin console shares the mobile app's brand — **warm cream, sage-green, and gold on Manrope** — but wears it as a **calm, dense data console**, not a boutique storefront. It's built with React 19 + Vite and plain CSS (no Tailwind): every color, radius, and shadow is a **CSS custom property** defined at the top of `apps/admin/src/styles/global.css`, and every reusable widget lives in `apps/admin/src/components/ui`.

**Core principle:** Reuse before you build, and token before you type a value. There is a component for tables, filters, menus, modals, toasts, loading, errors, and stat cards — compose those; don't hand-roll `<table>`/`<select>`/popover markup or literal hex.

> The mechanical rules (use CSS-variable tokens, reuse `components/ui`, keep styles in `global.css`) live in `apps/admin/CLAUDE.md`. This skill is the *aesthetic + component-choice layer* on top — read both.

## Aesthetic DNA

Warm and trustworthy, but efficient — an admin reviews queues and scans tables all day.

| Do | Don't |
|---|---|
| Warm cream/taupe surfaces, sage + gold accents | Cool grays, pure-white chrome, neon, default blue |
| Soft rounding (8–16px), pill buttons | Sharp 2–4px corners, hard boxy panels |
| Soft `--shadow-card`; `--shadow-pop` for overlays | Heavy dark drop shadows |
| One green accent + gold/bronze for reporting | Many competing bright accents |
| Descriptive, interface-voice empty/error copy | "Error", "Loading...", "Something went wrong" |
| Kebab action menus + dropdown filters | Stacks of inline buttons, rows of filter pills |

## Palette at a glance (all are CSS vars in `global.css`)

- **Primary accent:** `--color-primary` `#97a591` (sage), `--color-primary-dark` `#556251` (button fill, active nav), `--color-primary-muted` (tint).
- **Surfaces:** `--color-background` `#fdfaf8` (cream page), `--color-surface` white cards, `--color-surface-muted`.
- **Warm neutrals:** `--color-taupe`, `--color-warm-border`, `--color-warm-subtle` — borders, table headers, dividers, hovers.
- **Text:** `--color-text-primary` (headings), `--color-text-secondary` (body), `--color-text-muted` / `--color-text-placeholder` (meta).
- **Accent / reporting:** `--color-gold` `#f5a623`, `--color-gold-warm`, `--color-bronze`. Chart series: `--chart-1…6` (sage → taupe/gold), **never default recharts blue**.
- **Semantic:** `--color-success`, `--color-error`, `--color-warning` (+ their `-light` fills).

**No token for what you need? Pick the closest one — never invent a hex/rgba.**

## Type & shape at a glance

- **Font:** Manrope only (`--font-sans`). Page titles via `<PageHeader>`; card titles are 700-weight ~1rem; table headers are 0.75rem uppercase with letter-spacing.
- **Radii:** `--radius-sm` (8) inputs/menu items, `--radius-md` (12) menus/inputs, `--radius-lg` (16) cards, `--radius-full` pills/avatars.
- **Shadows:** `--shadow-card` for cards, `--shadow-pop` for menus/modals/toasts.
- **Layout:** pages render inside the sticky sidebar + `.page-container` (max-width 1440, centered). Never re-add a `max-width` to `.admin-content` — that caused the old right-side gap.

## Reuse-first component flow

Import from `@admin/components/ui`. Before writing markup, map the need:

```
Building a…
  data table                     → <Table columns={...} rows={...} rowKey={...} empty="…" />
                                     (expandable sub-rows via renderExpanded)
  status / list filter           → <FilterSelect label value options onChange /> in a .filter-bar
  styled dropdown (inc. in-row)  → <Select options compact? />
  row actions (edit/approve/…)   → <ActionMenu label>…<MenuItem/>…</ActionMenu>   (kebab ⋮)
  any dropdown/popover           → <Menu> + <MenuItem> / <MenuSeparator>
  confirm a destructive action   → <ConfirmDialog danger … />   (NOT window.confirm)
  ask for a value / reason       → <PromptDialog … />           (NOT window.prompt)
  any dialog / viewer            → <Modal title onClose footer? size?>
  full-section loading           → <LoadingState label /> ; list loading → <TableSkeleton />
  page-level failure             → <ErrorState message onRetry retrying />
  transient success/failure      → useToast(): toast.success(...) / toast.error(...)
  KPI tile                       → <StatCard label value icon iconTone hint loading />
  status pill, button, card,     → <Badge> / <Button> / <Card> / <Field>
  labelled field
  icon                           → import from ./icon (lucide), size via ICON_SIZE.*
```

Only build bespoke markup when nothing above fits. When you do, mirror an existing recipe: `--color-surface` bg, `--color-warm-border`, `--radius-lg`, `--shadow-card`, token spacing.

## Building / changing a page

1. Root is `<section>` with a `<PageHeader title subtitle />` first.
2. Data pages follow one shape: `useQuery` → `{ data, isLoading, error, refetch, isFetching }`, then
   `isLoading && <TableSkeleton/>`, `error != null && <ErrorState onRetry={() => void refetch()} retrying={isFetching}/>`, `data && <Table … />`.
3. Filters go in a `.filter-bar` above the table using `<FilterSelect>`.
4. Row actions live in an `<ActionMenu>`; destructive ones open a `<ConfirmDialog danger>`; text entry uses `<PromptDialog>`.
5. Mutations report through **toasts** (`useToast`), not inline text. Always pass a descriptive message via `apiErrorMessage(err)` on error.
6. Reporting/aggregate numbers are computed client-side (see `features/dashboard/use-dashboard-stats.ts`) — reuse the pattern; charts use recharts themed with the `--chart-*` vars.

## Common mistakes

- Hand-rolling `<table>`, `<select>`, or a popover instead of `Table` / `Select` / `Menu`.
- `window.confirm` / `window.prompt` instead of `ConfirmDialog` / `PromptDialog`.
- Bare `<p>Loading…</p>` or a flat one-line error instead of `TableSkeleton`/`LoadingState` and `ErrorState`.
- Literal hex or default chart colors instead of `--color-*` / `--chart-*` vars.
- Re-adding `max-width` to `.admin-content` (brings back the right-side gap) — width lives on `.page-container`.
- Rows of filter pills instead of a `FilterSelect` dropdown.

## Verify visually

After building UI, run the admin dev server (`pnpm --filter @nanny-app/admin dev`) and screenshot the page at a wide desktop width with the chrome-devtools MCP (or Playwright). Confirm: content fills the width with no dead right gap, the sidebar collapses cleanly, tables show a kebab menu + dropdown filter, skeletons show while loading, a forced failure shows `ErrorState` with Retry, and the palette reads warm cream/sage/gold — not just that it compiles.
