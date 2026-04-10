# Mobile App — CLAUDE.md

Expo React Native app for NannyApp. See root `.claude/CLAUDE.md` for architecture and shared conventions.

---

## Directory Structure

```
src/
├── screens/        # auth/, parent/, nanny/
├── components/     # NannyCard, BookingStatusBadge, MapView
├── hooks/          # useAuth, useNannies, useBookings
├── navigation/     # RootNavigator, ParentNavigator, NannyNavigator
├── store/          # authStore.ts (Zustand)
├── types/          # Central domain types (nanny, booking, etc.)
├── constants/      # Business constants (filters, OTP, booking)
├── mocks/          # Mock data + image URL constants
├── theme/          # Color tokens, typography, spacing, shadows
└── lib/            # firebase.ts, api.ts, queryClient.ts
```

---

## Core Patterns

- All API calls go through the Axios instance in `src/lib/api.ts` (auto-attaches JWT).
- All server state via **React Query** (TanStack) — no manual fetch/useEffect for data.
- UI state (auth, theme) via **Zustand**.
- No business logic in screens — delegate to hooks and services.

---

## Theme System (`src/theme/`)

All visual constants are centralized in `src/theme/` and imported via `@mobile/theme`.

**Mandatory rules — enforce on every mobile file change:**

- **NEVER hardcode hex colors** in StyleSheet or inline styles — use `colors.xxx` tokens
- **NEVER hardcode font family strings** like `'Manrope_700Bold'` — use `fontFamily.xxx` or spread `...typeScale.xxx`
- **NEVER hand-write shadow properties** — use `...shadows.sm | md | lg` spreads
- Use `spacing.xxx` for margins, padding, and gaps where an exact token match exists
- Use `borderRadius.xxx` for corner radii where an exact token match exists
- The canonical background color is `colors.background` (`#fdfaf8`). Never use `#fcf9f7`.
- **When improvising or filling in missing parts of a screen, ONLY use colors that already exist in `colors.ts`.** Do not invent new color values or add ad-hoc rgba/hex literals to work around a missing token. If no existing token fits, pick the closest one — do not create a new token without explicit instruction.

**Theme files:**
| File | Exports |
|---|---|
| `colors.ts` | `colors` — semantic color tokens (`primary`, `background`, `textPrimary`, etc.) |
| `typography.ts` | `fontFamily` — weight map; `typeScale` — pre-composed `TextStyle` presets |
| `spacing.ts` | `spacing` — scale (xxs→4xl); `screenPadding` — standard horizontal padding (24) |
| `borders.ts` | `borderRadius` — scale (sm→full) |
| `shadows.ts` | `shadows` — elevation presets as `ViewStyle` |
| `layout.ts` | `STATUS_BAR_HEIGHT`, `HEADER_HEIGHT`, `BOTTOM_NAV_HEIGHT` |
| `index.ts` | Barrel re-export of all above |

---

## Reusable UI Components (`src/components/ui/`)

Before creating any new visual pattern, check if an existing component covers it:

| Component | Use for |
|---|---|
| `Button` | All CTA buttons (primary, secondary, outline, text, destructive) |
| `TextInputField` | Form inputs with label, error, password toggle |
| `Card` | White card container with shadow |
| `Chip` | Filter pills / tag chips (active/inactive) |
| `Header` | Screen headers with back button |
| `SearchBar` | Search input bars |
| `Avatar` | Circular profile images |
| `Badge` | Notification dots / count badges |
| `IconCircle` | Icon inside a colored circle |
| `SectionHeader` | "Title + See all" section headers |
| `ScreenContainer` | SafeAreaView + background + StatusBar wrapper |
| `Divider` | Horizontal line with optional "or" text |

- Only create new UI components if no existing one covers the use case
- Import from `@mobile/components/ui`

---

## Screen Style Files (`screens/*/styles/`)

Every screen's `StyleSheet.create` block lives in a **dedicated style file**, not in the screen file itself:

- Auth screens: `src/screens/auth/styles/[screen-name].styles.ts`
- Parent screens: `src/screens/parent/styles/[screen-name].styles.ts`
- File naming: `[screen-name].styles.ts` (kebab-case, matching the screen file)
- Each style file imports only from `@mobile/theme` — no hardcoded values
- The screen file imports: `import { styles } from './styles/[screen-name].styles';`
- Screen files only retain theme imports that are used **directly in JSX** (e.g. icon `color` props)

---

## Central Types (`src/types/`)

All shared domain types live in `src/types/`, organized by domain file:

| File | Exports |
|---|---|
| `nanny.ts` | `NannyBase`, `NannyData`, `NannyCardData`, `NannyResult`, `NannyPreview`, `FavouriteNanny`, `NannyProfile`, `NannyReview`, `NannyBookingSummary` |
| `booking.ts` | `BookingTabKey`, `UpcomingBooking`, `PastBooking`, `BookingConfirmation` |
| `community.ts` | `PostTag`, `CommunityTab`, `PostAuthor`, `BasePost`, `AdvicePost`, `MarketplacePost`, `EventPost`, `Post` |
| `events.ts` | `Attendee`, `EventData` |
| `marketplace.ts` | `ProductItem` |
| `messages.ts` | `Conversation`, `ChatMessage` |
| `notifications.ts` | `NotificationType`, `AppNotification` |
| `care.ts` | `ActivityItem`, `QuickEntry`, `LogEntry`, `LiveActivityItem`, `ChildInfo` |
| `profile.ts` | `SettingsItem`, `UserProfile` |
| `dashboard.ts` | `PromoCard`, `QuickAction` |
| `registration.ts` | `Role`, `Child` |
| `search.ts` | `FilterChipData`, `SortOption` |
| `support.ts` | `FaqItem` |
| `index.ts` | Barrel re-export of all above |

**Mandatory rules:**

- **NEVER define shared types inline in screen files** — import from `@mobile/types`
- Component-local prop types (e.g. `{ nanny: NannyData; onPress: () => void }`) stay in their component file
- Screen-specific filter pill/chip unions stay local to the screen
- Use `import type` for type-only imports
- **No `any`** — if a type is unknown, define it properly in `types/`

---

## Constants (`src/constants/`)

Business constants, configuration values, and reusable filter definitions live in `src/constants/`:

| File | Exports |
|---|---|
| `registration.ts` | `AGE_OPTIONS`, `PREFERENCE_OPTIONS` |
| `otp.ts` | `OTP_LENGTH`, `RESEND_SECONDS` |
| `booking.ts` | `PROMO_CODE_VALUE`, `PROMO_DISCOUNT_PERCENT`, `PLATFORM_FEE_PERCENT` |
| `filters.ts` | `HOME_FILTER_TABS`, `FilterTab`, `SORT_OPTIONS`, `INITIAL_SEARCH_FILTERS` |
| `community.ts` | `TAGS` |
| `index.ts` | Barrel re-export of all above |

- Import via `@mobile/constants`
- Screen-specific filter chip arrays stay local to the screen

---

## Mock Data (`src/mocks/`)

All placeholder/mock data lives in `src/mocks/`, organized by domain:

| File | Exports |
|---|---|
| `images.ts` | All image URL constants (Figma CDN placeholders) |
| `nannies.ts` | `MOCK_NANNIES_HOME`, `MOCK_NANNIES_SEARCH`, `MOCK_NANNIES_RESULTS`, `MOCK_NANNY_BOOKING` |
| `nanny-profile.ts` | `MOCK_NANNY_PROFILE` |
| `bookings.ts` | `MOCK_BOOKING`, `MOCK_UPCOMING_BOOKINGS`, `MOCK_PAST_BOOKINGS` |
| `dashboard.ts` | `PROMO_CARDS`, `QUICK_ACTIONS`, `RECOMMENDED_NANNIES`, `FAVOURITE_NANNIES` |
| `community.ts` | `MOCK_POSTS` |
| `events.ts` | `MOCK_EVENTS` |
| `marketplace.ts` | `MOCK_PRODUCTS` |
| `messages.ts` | `MOCK_CONVERSATIONS`, `MOCK_MESSAGES` |
| `notifications.ts` | `MOCK_NOTIFICATIONS` |
| `care.ts` | `MOCK_CHILD`, `QUICK_ENTRIES`, `MOCK_LOG_ENTRIES`, `TODAY_ACTIVITIES`, `YESTERDAY_ACTIVITIES`, `MOCK_ACTIVITIES_LIVE` |
| `profile.ts` | `MOCK_PROFILE`, `SETTINGS_ITEMS` |
| `support.ts` | `MOCK_FAQS` |
| `reviews.ts` | `MOCK_REVIEWS` |
| `index.ts` | Barrel re-export of all above |

**Mandatory rules:**

- **NEVER define mock data inline in screen files** — import from `@mobile/mocks`
- **NEVER define image URL constants in screen files** — import from `@mobile/mocks/images`
- Each mock file imports types from `@mobile/types` and images from `@mobile/mocks/images`
- Import via `@mobile/mocks` or `@mobile/mocks/images`

---

## Environment Variables (via `app.config.ts` + Expo Constants)

| Variable | Description |
|---|---|
| `API_BASE_URL` | Backend API base URL |
| `FIREBASE_PROJECT_ID` | Firebase project |
| `FIREBASE_API_KEY` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain |

---

## Testing

- React Native Testing Library for components and hooks.
- Test files live at `src/**/__tests__/*.test.tsx`.
- Coverage threshold: 80% (enforced in CI).

---

## Known Gotchas

**Expo managed workflow limitations**
Some native modules (e.g., react-native-maps with Google Maps on Android) require config plugins. Test early on a real device, not just Expo Go.

**pnpm + React Native**
Metro bundler does not understand pnpm's symlink structure by default. You may need `resolver.nodeModulesPaths` or `unstable_enablePackageExports` in `metro.config.js`.

---

## Visual Validation Workflow

When asked to validate a component visually, follow these steps in order:

**Step 1 — Build**
`COMPONENT=<path/to/Component.tsx> npm run preview:web`
Wait for exit code 0. Output lands in `dist/preview/`.

**Step 2 — Serve**
`npx serve dist/preview --listen 3100 --no-clipboard`
Run in background. Port is 3100.

**Step 3 — Screenshot via Playwright MCP**
Call these tools in sequence — do not write a script:
1. `browser_navigate` → `http://localhost:3100`
2. `browser_wait_for` → selector `#root > *`, timeout 10000ms
3. `browser_screenshot` → save to `screenshots/<ComponentName>.png`

**Step 4 — Tear down**
Kill the serve process from Step 2.

### Rules
- Never use a standalone Playwright script — always call MCP tools directly
- Never screenshot before `#root > *` is visible
- Always tear down the server after capturing
- If the build fails, stop and report — do not attempt to screenshot

### Viewport
390x844 (iPhone 14). Set in `.mcp/playwright.json` — do not override.

### Output
`screenshots/<ComponentName>.png` — this is passed to the visual diff step.
