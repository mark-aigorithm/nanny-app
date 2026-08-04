# Expo & EAS Commands — NannyNow Mobile

A practical reference for the Expo / EAS commands used to develop, build, and ship the
NannyNow app. Tailored to **this** project's config (`app.config.ts`, `eas.json`), not generic.

**Run everything from `apps/mobile/`.** Prefix with `npx` (e.g. `npx eas ...`, `npx expo ...`)
so you use the version pinned in the repo rather than a global install.

**Project facts (from config):**

| Thing | Value |
|---|---|
| App name / slug | `NannyNow` / `nanny-app` |
| EAS project id | `cd5987c1-9302-4742-b278-97926265980c` |
| iOS bundle id | `com.nannyapp.mobile` |
| Android package | `com.nannyapp.mobile` |
| Build profiles | `development`, `preview`, `production` |
| Submit profiles | `production` |
| Version source | `remote` — build/version numbers live on EAS servers, not in `app.config.ts` |

> **Expo Go does NOT work for this app.** It uses native modules and config plugins
> (`@react-native-firebase/*`, `react-native-vlc-media-player`, `react-native-maps`,
> `expo-secure-store`, custom `./plugins/withIosFirebasePods`). You must run a **dev client**
> build (`development` profile) or a local `expo run:*` build. Anything touching native code
> requires a fresh build — it will **not** arrive over an OTA update.

---

## 1. Setup & account

| Command | What it does |
|---|---|
| `npx eas login` | Log in to your Expo account (needed before any build/submit) |
| `npx eas logout` | Log out |
| `npx eas whoami` | Show which Expo account you're logged in as |
| `npx expo whoami` | Same, via the Expo CLI |
| `npx eas init` | Link the local project to an EAS project (already done — id is in `app.config.ts` under `extra.eas.projectId`) |

---

## 2. Local development (no EAS servers)

| Command | What it does |
|---|---|
| `pnpm start` / `npx expo start` | Start the Metro dev server. Add `--dev-client` to open in the installed dev build instead of Expo Go |
| `npx expo start --clear` | Start Metro and clear the bundler cache (fixes stale-module weirdness) |
| `pnpm ios` / `npx expo run:ios` | Build the native iOS app **locally** and launch it (requires macOS + Xcode) |
| `pnpm android` / `npx expo run:android` | Build the native Android app **locally** and launch it (requires Android SDK) |
| `npx expo prebuild` | Generate the native `ios/` and `android/` folders from config. Usually unnecessary — EAS runs this for you. Use `--clean` to regenerate from scratch |
| `npx expo install <pkg>` | Add a dependency at the version compatible with the current Expo SDK (use this instead of `pnpm add` for Expo/native packages) |

> `pnpm start`, `pnpm ios`, `pnpm android` are the scripts defined in `package.json`.

---

## 3. EAS Build (cloud builds)

Builds run on Expo's servers and are configured by the profiles in `eas.json`.

### iOS

| Command | What it does |
|---|---|
| `npx eas build --platform ios --profile development` | **Dev client** build (`developmentClient: true`, internal distribution). This is the build you install to develop against — install the `.ipa`, then `expo start --dev-client` |
| `npx eas build --platform ios --profile preview` | Internal test build for sharing (TestFlight-style ad-hoc / internal) |
| `npx eas build --platform ios --profile production` | Release build for the App Store. `autoIncrement: true` bumps the build number automatically |

### Android

| Command | What it does |
|---|---|
| `npx eas build --platform android --profile development` | Dev client **APK** (`buildType: apk`, installable directly on a device) |
| `npx eas build --platform android --profile preview` | Internal test **APK** for sharing |
| `npx eas build --platform android --profile production` | Release build (AAB by default) for Google Play |

### Both / useful flags

| Command / flag | What it does |
|---|---|
| `npx eas build --platform all --profile production` | Build iOS **and** Android in one command |
| `--local` | Run the build on your machine instead of Expo's servers (needs full native toolchain) |
| `--no-wait` | Kick off the build and return immediately instead of streaming logs |
| `--clear-cache` | Ignore the EAS build cache — use when a build fails from stale native cache |
| `--message "..."` | Attach a note to the build in the EAS dashboard |
| `npx eas build:list` | List recent builds and their status |
| `npx eas build:view [id]` | Show details/logs for a specific build |
| `npx eas build:cancel` | Cancel an in-progress build |

---

## 4. EAS Submit (upload builds to the stores)

Submit is a **separate step** from build — it takes an existing build and uploads it to the
store. Configured by the `submit.production` profile in `eas.json`.

| Command | What it does |
|---|---|
| `npx eas submit --platform ios --profile production --latest` | Upload the **latest** iOS production build to App Store Connect (→ TestFlight / review). This is the command you asked about earlier |
| `npx eas submit --platform android --profile production --latest` | Upload the latest Android build to Google Play |
| `npx eas submit --platform ios --profile production --id <build-id>` | Submit a specific build by id instead of the latest |
| `npx eas submit --platform ios --profile production --path ./app.ipa` | Submit a local binary file directly |

### Build + submit in one go

| Command | What it does |
|---|---|
| `npx eas build --platform ios --profile production --auto-submit` | Build, then automatically submit to the store when it finishes |
| `... --auto-submit-with-profile <name>` | Same, but pick a specific submit profile |

> First-time iOS submit will prompt for App Store Connect credentials (Apple ID / API key).
> The `submit.production` profile is currently empty `{}`, so EAS asks interactively — you can
> later fill in `appleId`, `ascAppId`, and `appleTeamId` there to skip the prompts.

---

## 5. EAS Update (OTA — JS-only over-the-air updates)

> ⚠️ **Not wired up yet.** `expo-updates` is **not** in `package.json`, so `eas update` will not
> work until it's installed and configured. To enable it:
> ```bash
> npx expo install expo-updates
> npx eas update:configure
> ```
> After that, only **JS/asset** changes ship this way — any native change (new native module,
> plugin, permission) still needs a full `eas build`.

| Command | What it does (once enabled) |
|---|---|
| `npx eas update --branch production --message "..."` | Publish an OTA update to the `production` branch |
| `npx eas update --branch preview --message "..."` | Publish to the `preview` branch |
| `npx eas update:configure` | One-time setup: wires runtime version + update URL into the config |
| `npx eas branch:list` | List update branches |
| `npx eas channel:list` | List channels (map builds → update branches) |
| `npx eas update:list --branch production` | List published updates on a branch |

---

## 6. Secrets & environment variables

This app reads several keys from the environment at build time (see `app.config.ts`):
`GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY`, `API_BASE_URL`, `FIREBASE_*`,
`CURRENCY_CODE`, `OTP_BYPASS_ENABLED`. For cloud builds these must exist as **EAS secrets**
(local `.env` is not uploaded).

| Command | What it does |
|---|---|
| `npx eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value <key>` | Create/set a secret used during EAS builds |
| `npx eas secret:list` | List the project's secrets (values hidden) |
| `npx eas secret:delete --name GOOGLE_MAPS_API_KEY` | Delete a secret |
| `npx eas env:list` | List EAS-managed environment variables (newer env-var system) |
| `npx eas env:pull` | Pull EAS env vars into a local `.env` file |

> `GOOGLE_MAPS_API_KEY` in particular must be set as an EAS secret or Android Maps will be
> blank in cloud builds — the key is never committed to the repo.

---

## 7. Credentials (signing)

| Command | What it does |
|---|---|
| `npx eas credentials` | Interactive manager for iOS certs/provisioning profiles and Android keystores |
| `npx eas credentials --platform ios` | Jump straight to iOS credentials |
| `npx eas device:create` | Register an iOS device UDID for `development`/`preview` (ad-hoc) builds — required before those iOS builds will install |
| `npx eas device:list` | List registered iOS devices |

---

## 8. Versioning (remote source)

Because `eas.json` sets `"appVersionSource": "remote"`, the build number lives on EAS, not in
`app.config.ts`. The `production` profile's `autoIncrement: true` bumps it on each build.

| Command | What it does |
|---|---|
| `npx eas build:version:get` | Show the current remote version/build number |
| `npx eas build:version:set` | Manually set the remote build number |
| `npx eas build:version:sync` | Sync the remote version back into local native files if needed |

---

## 9. Diagnostics & health

| Command | What it does |
|---|---|
| `npx expo-doctor` | Check the project for dependency/config problems and SDK mismatches |
| `npx expo install --check` | Verify installed native packages match the Expo SDK; `--fix` to correct |
| `npx eas diagnostics` | Print environment info for EAS bug reports |
| `npx eas build:inspect` | Inspect the exact build environment/output for debugging |

---

## 10. Typical flows

**Set up a new dev machine / device (native dev):**
```bash
npx eas build --platform ios --profile development     # or android
# install the resulting build on the device, then:
npx expo start --dev-client
```

**Ship a new production release (iOS):**
```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios --profile production --latest
```

**Ship both platforms and auto-submit:**
```bash
npx eas build --platform all --profile production --auto-submit
```

---

## Project-specific gotchas

- **`eas build` crashing with `Cannot read properties of undefined (reading 'CommonJS')`** is a
  known broken TypeScript 7 pulled in by `eas-cli`. Fix by force-installing `typescript@5.5.4`
  before building. (Recorded from a prior session.)
- **Expo Go is unusable here** — always use a `development` (dev client) build. See the note at
  the top.
- **Native changes need a rebuild, not an update** — anything touching `plugins`,
  permissions, or a native dependency (Firebase, VLC, Maps) requires a fresh `eas build`.
- **`GOOGLE_MAPS_API_KEY` must be an EAS secret** for cloud builds, or Android Maps renders blank.
- **iOS uses Apple Maps, not Google Maps** by design (see the comment in `app.config.ts`), so no
  iOS Google Maps key is needed.
