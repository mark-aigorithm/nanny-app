# NannyNow Admin — CLAUDE.md

Mechanical rules for the admin web app (`apps/admin`). The *aesthetic* layer lives in the
`nanny-app-admin-design` skill — read both. Root conventions live in the repo `.claude/CLAUDE.md`.

## Stack

React 19 + Vite 6 + TypeScript (strict), react-router-dom 7, TanStack Query 5, axios, Firebase
auth, Zod. Shared types come from `@nanny-app/shared`. Icons: `lucide-react`. Charts: `recharts`.
**No CSS framework** — plain CSS with CSS custom properties in `src/styles/global.css`.

## Path alias

`@admin/*` → `apps/admin/src/*` (also `@shared/*` → `packages/shared/src/*`).

## Styling rules

- **Tokens, not literals.** Every color, radius, and shadow is a CSS variable on `:root` in
  `src/styles/global.css` (mirrored from the mobile theme). Use `var(--color-…)`, `var(--radius-…)`,
  `var(--shadow-…)`, `var(--chart-…)`. Never write a raw hex/rgba in a component or new rule.
- **One stylesheet.** Add styles as new class rules in `global.css` (it's organized in labelled
  sections). No CSS modules, styled-components, or inline style objects for anything themeable
  (dynamic values like a computed width are the only inline exception).
- **Layout width lives on `.page-container`** (max-width, centered), never on `.admin-content` —
  a `max-width` there left a dead gap on the right.

## Component rules

- **Reuse `src/components/ui` first.** It exports `Table`, `FilterSelect`, `Select`, `Input`,
  `Menu`/`MenuItem`, `ActionMenu`, `Modal`, `ConfirmDialog`, `PromptDialog`, `Spinner`, `Skeleton`,
  `LoadingState`, `TableSkeleton`, `ErrorState`, `ToastProvider`/`useToast`, `StatCard`, plus
  `Badge`/`Button`/`Card`/`Field`/`PageHeader` and the lucide `icon` re-exports. Import from the
  barrel `@admin/components/ui`.
- **No `window.confirm` / `window.prompt` / `alert`.** Use `ConfirmDialog` / `PromptDialog` / toasts.
- **No hand-rolled `<table>`, `<select>`, or popover** when the shared component fits.

## Privileges (operators)

An `OPERATOR` only reaches the sections the superuser granted. `lib/permissions.tsx` holds the one
`/admin/me` fetch and exposes it globally:

- `usePermissions()` → `{ me, role, can(section, level), landingPath }`; `useCanManage(section)` is
  the shorthand for the write check. Both delegate to `hasSectionAccess` in `@nanny-app/shared` —
  **never re-implement the rule**, and never gate on `role` directly except for the superuser-only
  Team page.
- Routes are wrapped in `<RequireSection section=…>` in `app.tsx`; the sidebar filters `navItems` by
  their `section`. A new page needs an entry in both, plus a row in the backend's route table.
- Write controls (create forms, `ActionMenu` items, Save buttons) render only when
  `useCanManage('<section>')` — a view-only operator sees the page, not the controls.
- Queries whose section the viewer lacks must be `enabled: can(…)` so the page degrades instead of
  firing 403s (see `use-dashboard-stats.ts` and `notification-bell.tsx`).

---

## Data + feedback conventions

- Server state via TanStack Query; HTTP via the axios instance in `lib/api-client.ts`; typed
  endpoint functions in `lib/api.ts` (they unwrap `{ data, error }`). Don't call `fetch`/`axios`
  directly from components.
- Errors always flow through `apiErrorMessage(err)` (`lib/api-error.ts`) — it maps HTTP status to
  descriptive, interface-voice copy.
- Page/query failures render `<ErrorState onRetry={() => void refetch()} />`; loading renders
  `<TableSkeleton>` (lists) or `<LoadingState>` (forms). Mutation results report via `useToast()`.
- Aggregate/reporting numbers are computed client-side from existing list endpoints (see
  `features/dashboard/use-dashboard-stats.ts`) — there is no `/admin/stats` API yet.

## Commands (from `apps/admin`)

```bash
pnpm dev         # Vite dev server on :5173 (proxies /api to the backend)
pnpm typecheck   # tsc --noEmit (strict; must pass)
pnpm build       # tsc -b && vite build
```

TypeScript is strict with `noUncheckedIndexedAccess` — guard indexed access and never use `any`.
