ultrathink. Review ALL changed files for quality, cleanliness, and adherence to project conventions. This is a non-destructive audit — report findings and fix them without changing any visible behavior.

## Scope

Review all files changed since the last commit (use `git diff HEAD` and `git status`). If no uncommitted changes exist, review the files changed in the most recent commit (`git diff HEAD~1`).

## Checks

### 1. Unused imports
- Scan every changed file for imports never referenced in the file body.
- Remove any unused imports. Includes all modules: components, hooks, types, utilities, third-party.

### 2. Unused variables and constants
- Find declared variables, constants, or function parameters that are never read.
- Remove if truly unused. Prefix with `_` only if required by a callback signature.

### 3. `any` type usage
- Search for `: any`, `as any`, `<any>`, `any[]` in changed files.
- Replace with a proper type, `unknown`, or a type guard. Never leave `any`.

### 4. Types in the wrong place
- Types shared between multiple files should be in `packages/shared/src/` (if cross-package) or a local `types.ts` (if package-scoped).
- Do not duplicate type definitions — if the same interface exists in two files, extract it.

### 5. DRY violations
- Identify repeated code blocks (3+ lines appearing in 2+ files).
- Common patterns: duplicated validation logic, copy-pasted utility functions, identical config structures.
- Fix if the duplication is clear-cut — extract to a shared utility or module. Don't speculatively abstract.

### 6. Code compactness
- Unnecessary intermediate variables used once that don't aid readability — inline them.
- Overly verbose conditionals that could be ternaries or short-circuits.
- Redundant `else` after `return`, double negations, empty `default:` cases.

### 7. File placement
- Verify files are in the correct directory per project conventions defined in CLAUDE.md.
- Flag any file that appears misplaced.

### 8. Import hygiene
- Prefer `import type { X }` for type-only imports.
- Verify path aliases (`@shared/*`, `@backend/*`, `@mobile/*`) are used instead of deep relative paths where available.
- Flag circular imports if detected.

### 9. Naming conventions
- Files: kebab-case (`auth.service.ts`, `nanny-card.tsx`)
- Variables/functions: camelCase
- Types/interfaces/classes: PascalCase
- Constants: SCREAMING_SNAKE_CASE for true constants, camelCase for derived values
- Flag violations in changed files.

### 10. Dead code
- Commented-out code blocks — remove unless marked with a TODO/FIXME explaining why it's kept.
- Unreachable code after `return`, `throw`, `break`.
- Functions/exports that are defined but never imported anywhere in the project.

## Output format

For each issue found:
1. State the category (e.g., "Unused import", "DRY violation")
2. State the file and line
3. Fix it immediately if safe — don't just report

After all fixes, run `git diff` to show a summary of changes so the user can verify no logic was altered.

## Rules
- **Do NOT change any behavior** — no logic changes, no API changes, no new features.
- **Do NOT add comments, docstrings, or type annotations** to code you didn't otherwise modify.
- **Do NOT refactor working logic** — this is a cleanup pass, not a rewrite.
- **Do NOT create new files** unless extracting a duplicated type/constant that clearly needs its own home.
- If unsure whether a change is safe, report it but don't apply it.
