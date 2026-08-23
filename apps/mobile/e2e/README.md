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

`-gpu host` has been seen to segfault mid-run (a stack of `gles_v2_imp.cpp …
error 0x501` lines, then the process dies), which takes the device out from
under whatever flow was running. Restart it and re-run; if it recurs often,
`-gpu swangle_indirect` is the next thing to try.

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
| `flows/_*.yaml` | Shared subflows; the leading underscore is what keeps them out of the run |
| `scripts/advance.js` | The other side of a two-sided journey, over HTTP |
| `accounts.mjs` | Who the lab signs in as — shared by the runner and the seeder |
| `fixtures.mjs` | What it spends: promo codes, a package, Care Points, platform settings |
| `run.mjs` | Prerequisite checks → seed → `maestro test`, per flow |
| `build.mjs` | Gradle debug build with the ABI pinned, then `adb install` |
| `android.mjs` | Locating adb and the one device to drive |
| `emulator-env.mjs` | The `10.0.2.2` values; `with-emulator-env.mjs` applies them to a command |

The subflows are where the awkward parts live, and most flows are little more
than a sequence of them:

| Subflow | What it does |
|---|---|
| `_launch.yaml` | Cold start with state cleared — five steps, all of them load-bearing (below) |
| `_sign-in.yaml` | Signs in `${PHONE}` from the welcome screen |
| `_book-to-review.yaml` | Home → the review step, with a booking that starts in ten minutes |
| `_book-and-pay.yaml` | The above, plus the nanny accepting and a real checkout |
| `_relaunch.yaml` | Reopens the app and waits for `${EXPECT}` |
| `_open-running-booking.yaml` | Reopens onto the detail screen of a shift under way |

Everything the lab spends is provisioned by `apps/backend/test/e2e/seed-mobile.ts`,
which owns the Firebase Admin SDK and Prisma. It runs **before every flow**, not
once per run: each flow books the same nanny for the next few hours, and the
second one to try would be refused for double-booking her. Seeding also *undoes*
the previous flow — this database is never truncated — which is what makes any
single flow runnable on its own.

## Notes

**Sign-in is phone-based.** The app derives a Firebase credential from the phone
number, so the seeder does the same derivation. The flows type only the local
digits — the country code is a separate, fixed control.

**Selectors.** Flows prefer visible text; `testID`s exist only where text is
ambiguous or absent (icon buttons, repeated labels, list cards), following
`testID="<screen>.<element>"`. Before adding one, check for an
`accessibilityLabel` — the star rating is driven by "Rate 5 stars", which the
control already carried.

**Two-sided journeys.** Maestro drives the mother (or the nanny) and
`scripts/advance.js` does everything the other side has to do — accepting the
request, checking in, writing a care log, checking out, approving an identity.
It runs on the *host*, in Maestro's own JS sandbox: `127.0.0.1`, no `fetch`, no
`require`. That last one is why every step lives in one file behind a `switch`
rather than one script apiece.

**The app does not notice work done behind its back.** React Query holds every
response for a minute (`staleTime` in `src/lib/queryClient.ts`) and no focus
manager is installed, so a screen showing a booking will not see the nanny check
into it — nor, after paying for extra hours, the new end time, despite
`ExtensionCheckoutScreen` returning to the booking believing it "re-reads on
focus". Reopening the app is what empties that cache, which is what
`_relaunch.yaml` is for and why A7 uses it three times.

**Payment.** The Paymob fake serves the checkout page the WebView opens, and
delivers the webhook server-side exactly as Paymob does — so a flow can pay by
tapping **Pay now** on a real page. See `apps/backend/test/fakes/paymob-server.ts`.

**The database is shared with the admin suite, and nothing truncates it.** Two failures traced to
this, both of which looked like app regressions and were neither:

- `scripts/advance.js` used to read the *first page* of `/admin/mothers` to find the account to
  approve. The lab's accounts are upserted by email, so they keep their original `createdAt` while
  the admin Playwright suite mints a fresh mother for most of its specs — there are now ~1000, and
  the lab's is nowhere near page one. It now pages. Any new queue lookup must do the same.
- The package catalogue is global, and B3 in the admin suite adds a package every time it runs, so
  the lab's package steadily sinks down the list until it is off the first screen. Maestro only sees
  what is rendered, so this failed as "E2E Starter is not visible" on a screen that was fine. A6 now
  scrolls to it. **Prefer `scrollUntilVisible` over `assertVisible` for anything in a list the
  console can add to.**

**A cold bundler fails as a broken selector.** `e2e:metro` starts with `--clear`, so the first
request pays for the whole build — over a minute. The dev client's fetch times out first and the app
shows "There was a problem loading the project", which reaches the flow as `_launch.yaml` not finding
the developer menu. `run.mjs` now builds the bundle once before any flow runs and prints how long it
took; if you see that step take a minute, that is the cost being paid in the right place.

**The emulator's `system_server` can die mid-run.** Symptoms are `cmd: Can't find service: package`
and, from Maestro's driver install, `NullPointerException … PackageManagerInternal.freeStorage on a
null object reference`. Every flow after it fails at launch. The device usually recovers on its own —
check `adb shell pm list packages` answers before believing a batch of failures is real, and re-run.
This is the `-gpu host` instability noted above wearing a different hat.

**Android's package verifier has to be off.** Maestro reinstalls its driver APK at the start of every
flow, and with the verifier on it intermittently dies with
`INSTALL_FAILED_VERIFICATION_FAILURE: Integrity verification timed out` — the verifier wants to phone
home about an unknown APK and loses that race on a loaded machine. `run.mjs` turns it off as part of
device prep, alongside the stylus tutorial.

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

**A lost VIEW intent.** Occasionally `openLink` simply does not start the app:
the device sits on its own home screen and logcat shows nothing at all for two
minutes. `_relaunch.yaml` retries, which is why it takes the selector to wait
for as a parameter — without something to check, a retry cannot tell a lost
intent from a slow launch.

## What the flows deliberately do not cover

**Registration, and the ID upload at the end of it.** A10 and A11 are described
in the catalogue as starting from role selection and walking the forms through
to an ID upload. That upload opens the Android photo picker and its crop
screen — system UI that changes between OS versions and would be the most
fragile thing in this suite, for the least return. Both flows instead start
from a seeded account in exactly the state registration leaves it, and assert
the part that only the app can show: the gate, and it lifting. What
registration itself decides is covered over HTTP in
`a10-nanny-onboarding.test.ts` and `a11-mother-id-gate.test.ts`.

**Anything an API journey already proves.** A4 does not re-derive when a promo
code's counter moves; A5 does not re-derive the ledger; A6 does not re-derive
hour accounting. Those are settled in `src/__integration__/journeys/`, against
the same database, far faster. The flows assert what is only true on a device:
that the discounted figure is the one the checkout page charges, that points
reserved before a nanny exists are applied without a tap once one accepts, and
that bought hours turn up where a mother would look for them.
