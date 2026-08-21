# Mobile end-to-end tests

Maestro drives the real app on a real Android emulator, against the same local
test stack the backend and admin suites use. Everything is free and local:
[Maestro](https://maestro.dev) is Apache-2.0 and runs entirely on this machine —
no Maestro Cloud, no hosted device farm, no EAS build.

Maestro drives **one** surface: the app. Anything the app cannot do to itself —
provisioning accounts, advancing the nanny's or the operator's side of a
journey — happens over HTTP, the same way the admin suite advances the mobile
side. No flow drives two UIs.

## One-time setup

**1. Maestro CLI** — native Windows is supported; WSL2 is not needed.

Download [`maestro.zip`](https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip)
(~315 MB) and extract it so the launcher lands at `%LOCALAPPDATA%\maestro\bin\maestro.bat`,
which is where the runner looks. Set `MAESTRO_BIN` to override that. Needs Java 17+
with `JAVA_HOME` set.

On macOS/Linux the runner looks in `~/.maestro/bin/maestro`, the default for
`curl -Ls https://get.maestro.mobile.dev | bash`.

> Deliberately **not** added to `PATH` by any script here: on Windows `setx PATH`
> truncates the user PATH at 1024 characters, which is far too destructive a
> side effect for a test runner. Add it by hand if you want `maestro` on the
> command line.

**2. Windows only: path length.** The native build fails with
`ninja: error: … Filename longer than 260 characters`, which surfaces as the far
less obvious `manifest 'build.ninja' still dirty after 100 tries`. React Native's
codegen writes deep paths (`…/codegen/jni/react/renderer/components/…`) beneath
pnpm's store directories, and the longest measured 281 characters.

The repo's `.npmrc` sets `virtual-store-dir-max-length=20`, which caps each store
directory name at its 32-character hash and takes the worst path to about 254.
**Changing that value requires a full reinstall** (`CI=true pnpm install` — pnpm
must remove `node_modules`, and refuses to without a TTY otherwise), followed by
`npx expo prebuild --platform android --clean`, because the generated project
hard-codes the old store paths in `settings.gradle`.

Enabling Windows long path support is worth doing as well:

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

but **on its own it does not fix this build**: a process only benefits if its own
manifest declares long-path awareness, and the NDK's bundled `ninja` does not.
Verified on this repo — the flag was set to `0x1` and the build failed
identically.

Only the native build is affected; the backend, admin and unit suites don't care.

**3. Android emulator** — needs the SDK command-line tools, a system image and
an AVD:

```bash
sdkmanager "cmdline-tools;latest" "system-images;android-35;google_apis;x86_64"
```
```bash
avdmanager create avd -n nanny-e2e -k "system-images;android-35;google_apis;x86_64" -d pixel_6
```

`google_apis` rather than `default`: `@react-native-firebase/auth` needs Google
Play services on the device. Not `google_apis_playstore`, which is a locked
image — these tests need a writable system.

Start it with `-gpu host`. The software renderer (`swiftshader_indirect`) is so
slow on this image that the system never finishes booting — `adb` reports the
device while every `adb shell` hangs, which reads like a hang rather than the
slow boot it is.

**4. Build the app** (debug — no signing, no EAS):

```bash
pnpm --filter @nanny-app/mobile e2e:build
```

Then start Metro, which serves the JS and the config that points the app at the
local stack:

```bash
pnpm --filter @nanny-app/mobile e2e:metro
```

`e2e:build` is `expo run:android` with the ABI pinned to `x86_64`. Expo derives
ABIs from the device, and the API 35 image advertises `arm64-v8a` too because it
can translate arm binaries — so `expo run:android` builds a second native slice
the emulator never loads, doubling the build and adding a way for it to fail.

## Running

Four things have to be up. Each in its own terminal, because each one's log is
what explains a failure:

```bash
pnpm test:env
```
```bash
pnpm --filter @nanny-app/backend start:test
```
```bash
emulator -avd nanny-e2e -gpu host
```
```bash
pnpm --filter @nanny-app/mobile e2e:metro
```

Then:

```bash
pnpm test:e2e:mobile
```

Or a single flow, by name or prefix:

```bash
pnpm test:e2e:mobile smoke
```

The runner checks all four prerequisites before doing anything and names the
missing command rather than failing inside a flow.

## Layout

| Path | What it is |
|---|---|
| `flows/*.yaml` | The flows themselves, named for `Docs/testing/e2e-flows.md` |
| `flows/_launch.yaml` | Shared opening steps; `_`-prefixed files are subflows, not tests |
| `accounts.mjs` | Who the lab signs in as — shared by the runner and the seeder |
| `run.mjs` | Prerequisite checks → seeding → `maestro test` per flow |
| `build.mjs` | Gradle debug build with the ABI pinned, then `adb install` |
| `android.mjs` | Locating adb and the one device to drive |
| `emulator-env.mjs` | The `10.0.2.2` values; `with-emulator-env.mjs` applies them to a command |

Accounts are provisioned by `apps/backend/test/e2e/seed-mobile.ts`, which owns
the Firebase Admin SDK and Prisma. Seeding is idempotent, so re-running a flow
is always safe.

## Notes

**Sign-in is phone-based.** The app derives a Firebase credential from the phone
number, so the seeder does the same derivation. The flows type only the local
digits — the country code is a separate, fixed control.

**Selectors.** Flows prefer visible text; `testID`s exist only where text is
ambiguous or absent (icon buttons, repeated labels, list cards), following
`testID="<screen>.<element>"`.

**Payment.** The Paymob fake serves the checkout page the WebView opens, and
delivers the webhook server-side exactly as Paymob does — so a flow can pay by
tapping **Pay now** on a real page. See `apps/backend/test/fakes/paymob-server.ts`.

**The emulator is not reset between flows.** Every flow opens with
`runFlow: _launch.yaml`, which clears the app's own storage — that is what keeps
them order-independent.

## Why launching takes five steps

`_launch.yaml` looks over-engineered until each step has cost you an afternoon.
All five were found by watching a flow fail against a screen that looked fine:

1. **`launchApp` with `permissions: all: allow`.** The app asks for notifications
   after sign-in and location on the search screens. Those are *system* dialogs:
   they land on top of whatever the flow is doing. Granting has to happen in the
   same step as `clearState`, because clearing state revokes every grant.
2. **`stopApp` before the deep link.** `launchApp` leaves the app in
   dev-launcher's "which server?" chooser, and a VIEW intent delivered to an
   already-running launcher is ignored.
3. **`openLink` rather than a plain launch.** This is a debug build, so
   `expo-dev-launcher` intercepts the launcher icon and shows its chooser instead
   of the app. The link names the Metro server and lands straight in the JS.
4. **Dismissing the developer menu — twice.** dev-client shows it on first launch
   after a state clear. "Continue" only dismisses the onboarding copy and leaves
   the menu itself open; `back` closes that.
5. **Waiting on the menu, not the app.** Both are modals, and **Android drops
   the content behind a modal out of the accessibility tree** — so the app's own
   text is invisible to Maestro however plainly it renders in a screenshot.
   Asserting on the app first is what makes this look like a broken selector.

**Cold start ANRs without an AOT compile.** Expo resolves its module registry
through kotlin-reflect, which on a JIT-only install burns 10+ seconds of CPU
building Kotlin's runtime metadata — past Android's startup budget, so the
system kills the process ("Reason: Process failed to complete startup") before
any JS runs. `e2e:build` runs `pm compile -m speed -f` after installing, which
costs about a minute once and makes every later launch start in a couple of
seconds.

**Maestro's text selectors are full-match regexes, not substrings.** A fragment
of a longer string matches nothing — use `'Some prefix.*'`. And keep selectors
ASCII: a non-ASCII placeholder (the password field's bullets) does not survive
the round trip through a Windows console into Maestro's regex, which is why that
field is selected by `below: 'Password'`.

**Gboard's stylus tutorial.** The API 35 image ships a stylus, and Gboard greets
the first tap into a text field with a full-screen "Try out your stylus" panel
that covers the form. `run.mjs` turns it off (`stylus_handwriting_enabled 0`) as
part of device prep.
