Commit all current changes following this process:

## Step 1 — Safety check
1. Run `git status` and `git diff` to review all staged, unstaged, and untracked changes.
2. Check for files that should NEVER be committed:
   - `.env`, `.env.local`, `.env.*.local` — secrets
   - `.mcp.json` — MCP config with API keys
   - `**/settings.local.json` — local Claude Code settings
   - `*.pem` — private keys
   - `node_modules/` — dependencies
   - `dist/`, `build/` — build outputs
   - `.expo/` — Expo cache
   - `cdk.out/` — CDK synth output
   - `apps/mobile/src/preview-entry-generated.tsx` — generated file
3. If any of these are missing from `.gitignore`, add them BEFORE committing.
4. If any file looks like it contains secrets (API keys, tokens, passwords, private keys), do NOT commit it — add to `.gitignore` and warn the user.

## Step 2 — Classify changes into logical groups
Group changes by area/purpose. Common groupings:
- **Infra / config**: `.gitignore`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.json`, CI/CD workflows
- **Shared package**: `packages/shared/` (Zod schemas, types)
- **Backend**: `apps/backend/` (routes, services, middleware, prisma)
- **Mobile**: `apps/mobile/` (screens, components, hooks, navigation)
- **Infra (CDK)**: `infra/` (stacks, constructs)
- **Docs**: `CLAUDE.md`, `README.md`
- **Dependencies**: `package.json`, `pnpm-lock.yaml` (group with the changes that required them)

If changes are small or tightly coupled, a single commit is fine. Don't over-split.

## Step 3 — Commit each group
For each logical group:
1. Stage only the relevant files by name — never use `git add -A` or `git add .`
2. Write a descriptive commit message in imperative mood, explaining the "why" not the "what"
3. Good examples:
   - `Add visual validation pipeline for React Native web previews`
   - `Fix React/React DOM version mismatch causing render failure`
   - `Add rate limiting middleware to auth routes`
4. Bad examples:
   - `Update files` — too vague
   - `Changed stuff` — no context
   - `WIP` — not descriptive

## Rules
- Never skip git hooks (no `--no-verify`)
- Always create NEW commits, never amend unless explicitly asked
- If a pre-commit hook fails, fix the issue and create a new commit
- Do NOT push to remote unless explicitly asked
