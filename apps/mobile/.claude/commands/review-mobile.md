ultrathink. Review ALL changed mobile app files (`apps/mobile/`) for quality, cleanliness, and adherence to mobile project conventions. This is a non-destructive audit — report findings and fix them without changing any visible UI.

## Scope

Review all changed files under `apps/mobile/` since the last commit (use `git diff HEAD -- apps/mobile/` and `git status`). If no uncommitted changes exist, review files changed in the most recent commit (`git diff HEAD~1 -- apps/mobile/`).

## Checks

### 1. Unused imports
- Scan every changed file for imports never referenced in the file body.
- Remove any unused imports: React Native components (View, Text, etc.), theme tokens, hooks, types, third-party modules.

### 2. Unused variables and constants
- Find declared variables, constants, or function parameters that are never read.
- Remove if truly unused. Prefix with `_` only if required by a callback signature.

### 3. `any` type usage
- Search for `: any`, `as any`, `<any>`, `any[]` in changed files.
- Replace with a proper type, `unknown`, or a type guard. Never leave `any`.

### 4. Styles in the wrong place
- Screen `.tsx` files must NOT contain `StyleSheet.create` — styles belong in `screens/*/styles/[name].styles.ts`.
- Style files must only import from `@mobile/theme` — no hardcoded hex colors, font strings, or shadow properties.
- If a screen file imports `colors` or other theme tokens directly from `@mobile/theme`, verify it's truly needed (icon color props, dynamic style values). Flag any that could move to the style file.
- Grep for any raw hex color (`#[0-9a-fA-F]{3,8}`) or `rgba(` in screen and style files — all must use `colors.xxx` tokens.

### 5. Constants and mock data in the wrong place
- Hardcoded mock arrays, placeholder data, and image URL constants must live in `src/mocks/`, not inline in screen files.
- ASSUMPTION/TODO comments about mock data are fine, but the actual data should be imported from `@mobile/mocks/`.
- Screen-local type definitions used only for mock data shape should move alongside the mock data file or to a shared types location.

### 6. Types in the wrong place
- Types shared between multiple mobile files should be in a local `types.ts` or in `packages/shared/src/` if cross-package.
- Do not duplicate type definitions — if the same interface exists in two files, extract it.
- Types used by both the screen and its style file should live in a shared location importable by both.

### 7. DRY violations
- Identify repeated code blocks (3+ lines appearing in 2+ files).
- Common mobile patterns to catch: identical header layouts, repeated card/list-item patterns, duplicated filter/chip logic, copy-pasted navigation handlers, repeated icon+text rows.
- Check if an existing UI component in `src/components/ui/` already covers a pattern being hand-built in a screen.
- Fix if the duplication is clear-cut — extract to a shared component or hook. Don't speculatively abstract.

### 8. Code compactness
- Unnecessary intermediate variables used once that don't aid readability — inline them.
- Overly verbose conditionals that could be ternaries or short-circuits.
- Redundant `else` after `return`, double negations, empty `default:` cases.

### 9. File placement
- Screens: `src/screens/auth/` or `src/screens/parent/`
- Screen styles: `src/screens/*/styles/[name].styles.ts`
- Reusable components: `src/components/` or `src/components/ui/`
- Mock data: `src/mocks/`
- Theme tokens: `src/theme/`
- Flag any file in the wrong directory.

### 10. React Native best practices
- `key` props: must use stable unique IDs, not array indices (unless list is static and never reordered).
- Inline object/array creation in JSX props (`style={[styles.x, { marginTop: 5 }]}`) — flag if the same inline object is used on every render and could be a named style.
- Large lists using `ScrollView` instead of `FlatList` — flag if the list is dynamic or could grow beyond ~20 items.
- Event handlers defined inline (`onPress={() => doSomething(id)}`) in `.map()` loops — flag if they create a new function per render and the list is large.
- Missing `resizeMode` on `Image` components.

### 11. Theme compliance
- Every color in style files must come from `colors.xxx` — no exceptions.
- Every font must use `fontFamily.xxx` or `...typeScale.xxx` — no raw font strings.
- Every shadow must use `...shadows.sm|md|lg` — no hand-written shadow properties.
- Spacing values should use `spacing.xxx` where a matching token exists.
- Border radii should use `borderRadius.xxx` where a matching token exists.
- When improvising screen content, only existing `colors.ts` tokens are allowed — never invent new values.

### 12. Import hygiene
- Prefer `import type { X }` for type-only imports.
- Use `@mobile/*` alias instead of deep relative paths like `../../components/`.
- Screen files should import styles from `./styles/[name].styles` — not from theme directly for style definitions.

### 13. Dead code
- Commented-out code blocks — remove unless marked with a TODO/FIXME explaining why.
- Unreachable code after `return`, `throw`, `break`.
- Components or functions defined but never used in the file or imported elsewhere.

## Output format

For each issue found:
1. State the category (e.g., "Unused import", "Style in wrong place", "DRY violation")
2. State the file and line
3. Fix it immediately if safe (no UI change) — don't just report

After all fixes, run `git diff -- apps/mobile/` to show a summary of changes so the user can verify no UI was altered.

## Rules
- **Do NOT change any UI behavior** — no layout changes, no color changes, no component swaps, no new features.
- **Do NOT add comments, docstrings, or type annotations** to code you didn't otherwise modify.
- **Do NOT refactor working logic** — this is a cleanup pass, not a rewrite.
- **Do NOT create new files** unless extracting a duplicated type/constant that clearly needs its own home.
- If unsure whether a change is safe, report it but don't apply it.
