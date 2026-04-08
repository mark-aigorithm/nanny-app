# /fetch-design

Fetch a Figma design frame, implement it as a production-ready React Native component inside the NannyApp mobile app, and validate it visually using the project's preview pipeline.

## Usage

```
/fetch-design <FIGMA_URL> [target=screens|components]
```

### Arguments

| Argument  | Description                                                                 |
|-----------|-----------------------------------------------------------------------------|
| URL       | Full Figma frame URL (figma.com/design/FILE_KEY/...?node-id=NODE_ID)        |
| `target`  | `screens` (default) or `components` — controls output path                 |

### Example

```
/fetch-design https://figma.com/design/Tq3DPJ7aBcXyz91/NannyApp?node-id=12:34
/fetch-design https://figma.com/design/Tq3DPJ7aBcXyz91/NannyApp?node-id=12:34 target=components
```

---

## What This Command Does

### Step 1 — Fetch Design via Figma MCP

Parse the URL to extract `fileKey` and `nodeId` (convert `-` → `:` in nodeId).

Call `get_design_context` with the extracted keys and **always pass `forceCode: true`**. This returns:
- A reference code snippet (React + Tailwind — treat as a layout/style reference only)
- A screenshot of the frame
- Design hints: tokens, annotations, component mappings

### Step 2 — Implement the Component

Use **multiple agents in parallel** to implement the component. Split the work as follows:

- **Agent 1 — Component shell + layout**: renders the full structure (sections, scroll, fixed layers) with placeholder data and all `StyleSheet.create` styles
- **Agent 2 — Data hooks**: creates or updates the relevant hook(s) in `@mobile/hooks/` that wire React Query + the `@mobile/lib/api.ts` Axios instance to the screen's data needs
- **Agent 3 — Sub-components**: extracts any reusable sub-components (e.g. `NannyCard`, `FilterChip`) into separate files under `@mobile/components/`

Launch all three agents concurrently. Once all return, merge their output into the final file(s) before proceeding to Step 3.

Produce a production-ready React Native component that matches the design intent.

**Output location:**
- `target=screens` → `apps/mobile/src/screens/<role>/<FrameName>Screen.tsx`
  - `<role>` is `parent/` or `nanny/` based on the design context; use `auth/` for onboarding
- `target=components` → `apps/mobile/src/components/<FrameName>.tsx`

**Implementation rules — must follow CLAUDE.md:**

- Use `StyleSheet.create` for all styles — no inline style objects
- Map Figma Auto Layout → `flexDirection`, `gap`, `alignItems`, `justifyContent`
- Use `expo-image` for image nodes; `Pressable` for interactive nodes; `ScrollView` for scrollable frames
- Use path alias `@mobile/*` for all internal imports (e.g. `@mobile/hooks/useAuth`)
- **All server state** via React Query (`@tanstack/react-query`) — no `useEffect` + `fetch` patterns
- **All UI/auth state** via Zustand stores in `@mobile/store/`
- **All API calls** through the Axios instance at `@mobile/lib/api.ts` — never call `fetch` or construct URLs manually
- **Types** — infer from Zod schemas in `@shared/*`; never duplicate type definitions
- No business logic in the component — delegate to hooks in `@mobile/hooks/`
- Component name: PascalCase matching the file name (e.g. `NannyCardScreen`, `BookingStatusBadge`)

**Reference code from Figma is a starting point only.** Always:
- Replace Tailwind classes with `StyleSheet.create`
- Replace raw hex colors with tokens if the project defines them
- Replace any `div`/`span`/`img` with RN primitives (`View`, `Text`, `Image`)
- Wire up real data via hooks — do not hardcode placeholder values

### Step 3 — Visual Validation

Follow the visual validation workflow from CLAUDE.md exactly.

**Step 3a — Build**

```bash
COMPONENT=apps/mobile/src/<path>/<ComponentName>.tsx npm run preview:web
```

Wait for exit code 0. Output lands in `dist/preview/`.

**Step 3b — Serve**

```bash
npx serve dist/preview --listen 3100 --no-clipboard
```

Run in background.

**Step 3c — Screenshot via Playwright MCP**

Call these MCP tools in sequence — never write a Playwright script:

1. `browser_navigate` → `http://localhost:3100`
2. `browser_wait_for` → selector `#root > *`, timeout 10000ms
3. `browser_take_screenshot` → save to `screenshots/<ComponentName>.png`

Viewport is 390×844 (iPhone 14) — set in `.mcp/playwright.json`; do not override.

**Step 3d — Tear down**

Kill the serve process from Step 3b.

**If the build fails:** stop and report the error — do not attempt to screenshot.

### Step 4 — Report

After the screenshot is saved, report:

- Screenshot path: `screenshots/<ComponentName>.png`
- Output file: `apps/mobile/src/<path>/<ComponentName>.tsx`
- Any deviations from the Figma design (font substitutions, missing assets, etc.)
- Any props or hooks that need to be wired up before the screen is production-ready

---

## Notes

- Figma MCP must be connected and authenticated with a valid Figma access token.
- Playwright MCP must be enabled in the MCP server config.
- Never use a standalone Playwright script — always call MCP tools directly (CLAUDE.md rule).
- If the frame uses Figma Variables (design tokens), map them to the project's token system if one exists; otherwise use the raw values and add a comment flagging them for tokenisation.
- For screens that require navigation params, add a typed `NativeStackScreenProps` prop and note the required route in the report.
