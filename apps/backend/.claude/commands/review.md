ultrathink. Review ALL changed backend files (`apps/backend/`) for quality, cleanliness, and adherence to backend project conventions. This is a non-destructive audit — report findings and fix them without changing any API behavior.

## Scope

Review all changed files under `apps/backend/` since the last commit (use `git diff HEAD -- apps/backend/` and `git status`). If no uncommitted changes exist, review files changed in the most recent commit (`git diff HEAD~1 -- apps/backend/`).

## Checks

### 1. Unused imports
- Scan every changed file for imports never referenced in the file body.
- Remove any unused imports: Express types, middleware, services, utilities, Prisma models, Zod schemas.

### 2. Unused variables and constants
- Find declared variables, constants, or function parameters that are never read.
- Remove if truly unused. Prefix with `_` only if required by a callback signature (e.g., Express `(_req, res, next)`).

### 3. `any` type usage
- Search for `: any`, `as any`, `<any>`, `any[]` in changed files.
- Replace with a proper type, `unknown` + type guard, or the correct Prisma/Zod-inferred type. Never leave `any`.
- Pay special attention to Express request/response handlers — use typed `Request<Params, ResBody, ReqBody>` generics.

### 4. Zod schema and type conventions
- Types must be **inferred from Zod schemas** in `packages/shared` — never duplicate a type definition manually.
- Use `z.infer<typeof SomeSchema>` for deriving types.
- Request validation should use Zod middleware, not manual `if` checks on `req.body`.
- Flag any hand-written interface that duplicates what a Zod schema already defines.

### 5. Error handling
- All async route handlers must have proper error handling — either via an async wrapper middleware or explicit try/catch that calls `next(error)`.
- Never swallow errors with empty `catch {}` blocks.
- Use the project's `AppError` class (or equivalent) for operational errors — don't throw raw strings or generic `Error`.
- Avoid returning raw error messages to clients that could leak internal details (stack traces, SQL errors, file paths).

### 6. Environment and config
- **No `process.env` in application code** — all env vars must go through the typed `config` object from `src/lib/config.ts`.
- Flag any direct `process.env.XXX` access outside of config initialization.
- Secrets and API keys must never appear as string literals.

### 7. Prisma best practices
- Use `select` or `include` to fetch only needed fields — avoid pulling entire rows when only a few fields are used.
- Wrap multiple related writes in `prisma.$transaction()`.
- Use Prisma's typed query API — never raw SQL unless there's a PostGIS or performance reason (and document it).
- Flag N+1 query patterns: queries inside `.map()` or `for` loops that should be a single batch query.

### 8. API route conventions
- Routes should be thin — delegate business logic to service functions, not inline in route handlers.
- Request validation → service call → response formatting. Keep this three-step pattern.
- Use consistent HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error.
- Response shapes should be consistent across endpoints.

### 9. DRY violations
- Identify repeated code blocks (3+ lines appearing in 2+ files).
- Common backend patterns to catch: duplicated auth checks, repeated pagination logic, copy-pasted CRUD operations, identical error response formatting.
- Fix if the duplication is clear-cut — extract to middleware, a shared service method, or a utility.

### 10. Code compactness
- Unnecessary intermediate variables used once that don't aid readability — inline them.
- Overly verbose conditionals that could be ternaries or short-circuits.
- Redundant `else` after `return`, double negations, empty `default:` cases.
- Overly defensive null checks on values that are guaranteed by Zod validation or Prisma types.

### 11. File placement
- Routes: `src/routes/` — one file per resource (`nanny.routes.ts`, `booking.routes.ts`)
- Services: `src/services/` — business logic (`nanny.service.ts`, `booking.service.ts`)
- Middleware: `src/middleware/` — auth, validation, rate limiting, error handling
- Config: `src/lib/config.ts` — env var validation
- Types: inferred from `packages/shared` — not duplicated locally
- Flag any file in the wrong directory.

### 12. Import hygiene
- Prefer `import type { X }` for type-only imports.
- Use `@backend/*` alias instead of deep relative paths like `../../../services/`.
- Use `@shared/*` for shared Zod schemas and types.
- Flag circular imports if detected.

### 13. Security
- SQL injection: verify all database queries use parameterized queries (Prisma handles this, but flag any raw SQL).
- Input validation: all user input must pass through Zod validation before use.
- Auth checks: protected routes must verify JWT/session before processing.
- Rate limiting: flag public endpoints that lack rate limiting.
- Sensitive data: flag any endpoint that returns passwords, tokens, or internal IDs that shouldn't be exposed.

### 14. Dead code
- Commented-out code blocks — remove unless marked with a TODO/FIXME explaining why.
- Unreachable code after `return`, `throw`, `break`.
- Exported functions/middleware never imported anywhere in the project.
- Unused route definitions.

### 15. Logging and observability
- Errors should be logged before being passed to error handling middleware.
- Don't log sensitive data (passwords, tokens, full request bodies with PII).
- Use structured logging where available — not bare `console.log` in production code.

## Output format

For each issue found:
1. State the category (e.g., "Unused import", "N+1 query", "Raw process.env")
2. State the file and line
3. Fix it immediately if safe (no behavior change) — don't just report

After all fixes, run `git diff -- apps/backend/` to show a summary of changes so the user can verify no API behavior was altered.

## Rules
- **Do NOT change any API behavior** — no endpoint changes, no response shape changes, no new features.
- **Do NOT add comments, docstrings, or type annotations** to code you didn't otherwise modify.
- **Do NOT refactor working logic** — this is a cleanup pass, not a rewrite.
- **Do NOT create new files** unless extracting a duplicated type/constant that clearly needs its own home.
- If unsure whether a change is safe, report it but don't apply it.
