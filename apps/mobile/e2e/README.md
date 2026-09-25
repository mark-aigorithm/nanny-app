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

## Live-Firebase auth suite

Everything above runs against the Auth emulator. The five flows in
`flows/live/` do not: they drive the sign-in doors and both reset channels
against the **real** Firebase project, `nanny-now-d8518` — the one production
uses — because what they check is how Firebase itself behaves: phone sign-in,
the password credential registration links, and Firebase's own reset mail.

| Flow | What it proves |
|---|---|
| `sign-in-sms` | The default door: number + code lands on Home |
| `sign-in-email` | The secondary door: registration linked the real address as the password credential |
| `sign-in-sms-no-account` | The orphan guard: a code for an unregistered number is refused, and the harness confirms no Firebase account was left squatting on it |
| `reset-email` | The app asks Firebase to mail a link; the harness spends a reset code the way the hosted page would; signing in with the new password proves it changed |
| `reset-sms` | Code + new password in the app, then sign out and back in with that password |

**Two reserved numbers, and only ever these two.** Both are test numbers in the
Firebase console: their codes are fixed and no SMS is sent.

| Number | Code | Role |
|---|---|---|
| `+201234567891` | `111111` | The managed account (`markbotros0+e2e1@gmail.com`): registered through the app at the start of every run, purged at the end |
| `+201234567892` | `222222` | Never registered: drives the orphan guard |

The backend harness (`apps/backend/src/services/e2e-auth.service.ts`) refuses
every other number before it makes a single Firebase call, and has deliberately
no "list and clean up" operation. **No other number may ever be added to that
allowlist** — this project serves production, and the allowlist is the whole of
the safety story.

### Running it

The same four processes as the emulator suite, with two swapped:

```bash
pnpm test:env
```
```bash
pnpm --filter=@nanny-app/backend start:test:live-auth
```
```bash
emulator -avd nanny-e2e -gpu host
```
```bash
pnpm --filter @nanny-app/mobile e2e:metro:live
```

Then, from `apps/mobile`:

```bash
node e2e/live.mjs              # all five
node e2e/live.mjs reset-email  # one — still registers first and purges after
```

- **`start:test:live-auth` instead of `start:test`.** Rows, mail (Mailpit) and
  payments stay on the test stack; only the Firebase Admin SDK talks to the real
  project (which means FCM pushes go out live too — see
  `apps/backend/test/env.live-auth.ts`). It listens on :3001 like `start:test`, so
  stop one before starting the other. The runner refuses to start unless
  `/e2e-auth/account` answers, which the plain test backend never does.
- **`e2e:metro:live` instead of `e2e:metro`.** No rebuild: a debug build takes
  its config from Metro, so the one `e2e:build` APK serves both suites and
  switching means restarting Metro. The live variant leaves out
  `FIREBASE_AUTH_EMULATOR_HOST`, so native Auth talks to the real project; it
  **keeps Storage on the emulator**, which keeps the photo pickers' E2E
  placeholder on and keeps every upload out of the production bucket; and it sets
  `FIREBASE_APP_VERIFICATION_DISABLED_FOR_TESTING`, which has `lib/firebase.ts`
  skip Play Integrity / reCAPTCHA — neither of which an emulator driven by
  Maestro can pass. Firebase honours that flag only for console test numbers
  (and `lib/firebase.ts` applies it only in a `__DEV__` build). The runner reads
  Metro's manifest and refuses one serving the emulator config — and `run.mjs`
  refuses the reverse, a Metro with no Auth emulator host (or one whose manifest
  it cannot read), so the emulator suite can never sign in to the real project.
- The Auth emulator that `pnpm test:env` starts is left running and unused.
- `live.mjs` never runs the emulator suite's seeder and never talks to the Auth
  emulator. Its only state operations are the backend's `/e2e-auth` calls.

### What a run does

1. **`POST /e2e-auth/begin`.** The backend refuses (409) if either number
   already has a Firebase account. Such an account pre-dates the run, so the
   runner stops **without purging anything** — it never deletes an account it did
   not create. Find out where it came from, delete it by hand (Firebase console →
   Authentication), then run again. Before calling `begin` the runner reads both
   numbers (`GET /e2e-auth/account`, read-only) and stops on the same condition —
   because a *refused* `begin` also resets the harness's baseline, which would
   lock out the purge of a run another session has in flight. Once begun, it
   deletes the managed address's old mail from Mailpit, so registration's
   `email-otp` step can only find this run's code.
2. **Registers the managed account through the app** —
   `flows/live/_register-managed.yaml`, C2's wizard with the fixed code and no
   referral — then checks from Firebase's side that the account carries both the
   phone and the password provider, her address, and a row. Registration is the
   live proof that the real address gets linked, which is why it is not done over
   the Admin SDK. If it fails, no flow runs.
3. **Runs the flows in suite order** — `sign-in-sms` → `sign-in-email` →
   `sign-in-sms-no-account` → `reset-email` → `reset-sms` — whatever order they
   were asked for in. The account is registered once per run, so the order is what
   gives each flow the right starting password, and each reset sets one the
   account cannot already have (`E2eNewPassw0rd!`, then `E2eNewerPassw0rd!`).
4. **Finally — pass, fail or Ctrl+C — purges both numbers**, then prints what the
   harness sees on each. Both should end with `firebaseExists: false`. The
   backend only purges an account whose Firebase creation time is after `begin`.

`reset-email` sends Firebase's real reset mail to the managed address on every
run. Nothing reads it: the harness mints and spends its own reset code.

**If a run ends without purging** (a second Ctrl+C, a crash), the next `begin`
refuses. While the same live-auth backend process is still running and nothing
has called `begin` since, the run it began can still be purged:

```bash
curl -X POST -H 'Content-Type: application/json' -d '{"phone":"+201234567891"}' http://127.0.0.1:3001/e2e-auth/purge
curl -X POST -H 'Content-Type: application/json' -d '{"phone":"+201234567892"}' http://127.0.0.1:3001/e2e-auth/purge
```

Once the backend has restarted, or a `begin` has refused (which locks the
harness), only the Firebase console can remove it.

## Layout

| Path | What it is |
|---|---|
| `flows/*.yaml` | The flows themselves, named for `Docs/testing/e2e-flows.md` |
| `flows/_*.yaml` | Shared subflows; the leading underscore is what keeps them out of the run |
| `scripts/advance.js` | The other side of a two-sided journey, over HTTP |
| `accounts.mjs` | Who the lab signs in as — shared by the runner and the seeder |
| `fixtures.mjs` | What it spends: promo codes, a package, Care Points, platform settings |
| `run.mjs` | Prerequisite checks → seed → `maestro test`, per flow |
| `live.mjs` | The live-Firebase auth suite: begin → register → flows → purge (above) |
| `flows/live/*.yaml` | Its five flows, plus `_register-managed.yaml`; never run by `run.mjs` |
| `lab.mjs` | What both runners share: Maestro, Metro, device prep, one `maestro test` |
| `build.mjs` | Gradle debug build with the ABI pinned, then `adb install` |
| `android.mjs` | Locating adb and the one device to drive |
| `emulator-env.mjs` | The `10.0.2.2` values; `with-emulator-env.mjs` applies them to a command (`--live-auth` for the live suite's variant) |

The subflows are where the awkward parts live, and most flows are little more
than a sequence of them:

| Subflow | What it does |
|---|---|
| `_launch.yaml` | Cold start with state cleared — five steps, all of them load-bearing (below) |
| `_sign-in.yaml` | Signs in `${EMAIL}` / `${PASSWORD}` through the email door, from the sign-in screen |
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

**Sign-in, as setup, goes through the email door.** Phone + SMS code is the
app's default door, but reading a code back on every flow would be pure cost, so
`_sign-in.yaml` uses the email + password door instead; the seeded credential is
each account's real address. The doors themselves are covered live — see
[Live-Firebase auth suite](#live-firebase-auth-suite). Where a flow types a phone
number it types only the local digits — the country code is a separate, fixed
control.

**The root gate never signs out.** A signed-in account with no row resumes the
wizard ("Finish setting up your account"), and any other `/auth/me` failure
shows **"Couldn't connect"** with Retry. So a flow stuck on "Couldn't connect"
after signing in is the backend (down, or a 5xx in its log), not the app — and a
flow that leaves a row-less Firebase account behind (a crashed sign-up) does not
fail the next one, because `_launch.yaml` clears the session and the seeder
wipes the throwaway accounts.

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

It is not only the admin suite. The **backend integration suite** leaves its factory bookings
`PENDING`, so the nanny's open-requests pool holds dozens of cards wearing the same duration, price
and "1 child · 3 yrs" as the one a flow just created. C4 seeds a distinctive **allergy line** and
anchors every step to it (`below:` / `above:`); a bare `tapOn: 'Accept request'` claims a stranger's
booking and the flow then waits forever for a shift that is not hers.

Where a route allows it, **empty your own corner first** instead — it is the stronger move, because
it lets a flow assert an exact number rather than "one more than before". C5 deletes the mother's
posts, C6 marks both participants' conversations read, C8 marks her notifications read. That is what
makes `Unread (2)`, `Comments (1)` and a like count of one assertions rather than descriptions.

**Empty every account the flow counts, not just the one the app is signed in as.** C6 shipped
emptying only the seller's inbox and passed; the run after it failed on the *buyer's* unread count,
which had grown to two — each previous run had left her one unread reply. A flow that asserts a
number for somebody it never signs in as still has to reset that person. It passes the first time
either way, which is what makes this worth checking by **running a new flow twice in a row** before
believing it.

**A cold — or dead — bundler fails as a broken selector.** Two different problems both reach a flow
as `_launch.yaml` not finding the developer menu, which reads like a bad selector for something that
is genuinely not on screen:

- `e2e:metro` starts with `--clear`, so the first request pays for the whole build — one to two
  minutes. The dev client's own fetch times out first and the app shows "There was a problem loading
  the project".
- `metro-file-map`'s watcher gives up after four minutes — `Failed to start watch mode` in Metro's
  output. Metro then **still answers `/status` with 200** while every bundle request returns a 500
  from `DependencyGraph`.

  **This is a function of how many directories are watched, not of machine load.** `metro-file-map`
  uses watchman if it is installed, else a native watcher — and the native one is
  `platform() === "darwin"` only. On Windows it therefore always lands on `FallbackWatcher`, which
  registers a watch per directory and so scales with the size of the tree, against a hard-coded
  240s budget it cannot be configured out of.

  `metro.config.js` used to set `watchFolders = [workspaceRoot]`. Claude Code keeps its git
  worktrees in `.claude/worktrees/`, which is *inside* that root, and two of them carried complete
  installs — 95,876 of the 129,630 directories under the root, crawling 428,291 files. The watcher
  timed out every time, on an idle machine. Expo's `getDefaultConfig` already watches each
  workspace package plus the root pnpm store, so the override is now gone and the crawl is 100,764
  files. **If this returns, count directories before blaming load** — anything that puts another
  checkout under the repo root will reproduce it.

`run.mjs` now asks for the bundle itself before any flow runs, and **fails the run** if it cannot be
built — a liveness ping cannot tell a warm bundler from a dead one. If that step reports a minute or
two, the cold-start cost is being paid in the right place; if it fails, restart Metro.

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

**The driver can also need longer to start than Maestro waits.** `Maestro Android driver did not
start up in time` is not necessarily a broken driver: the reinstalled APK is JIT-only, and logcat
showed it reaching `Started listening to accessibility events` some 23s after launch — past the
default budget on a busy or memory-tight emulator. `MAESTRO_DRIVER_STARTUP_TIMEOUT` (milliseconds)
raises it, and `run.mjs` passes the environment through, so
`MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 pnpm test:e2e:mobile` is enough. Check logcat for that line
before concluding the driver is broken.

**Android's own dialogs are modals, and a modal hides everything behind it.** On a freshly booted
emulator the system throws up **"System UI isn't responding"** while it settles, which covered the
developer menu and failed `_launch.yaml` on a screenshot that plainly showed the menu underneath.
Give a cold emulator a minute before the first run — and do not assume it clears itself. It has been
seen still holding focus between runs, failing every flow until dismissed:
`adb shell dumpsys window | grep mCurrentFocus` names it, and tapping **Wait** clears it. The app has modals of its own with the same
effect: after checking a shift is due, the nanny's app opens onto a **"Shift starting soon"** prompt,
and a tap aimed at the tab bar behind it silently does nothing — C4 waits for the prompt and uses it,
which is what a nanny does anyway.

**`back` pops further than you expect.** Screens that navigate with `router.replace` leave nothing
underneath, so the hardware back button skips the screen a flow came from and lands on Home. Seen in
C8 (a notification routing *across* sections), C5 (post detail, after the create screen replaced the
feed) and C10 (Refer a friend). Use the screen's own back arrow — which is why `PostDetailScreen`
and `ChatThreadScreen` now carry `accessibilityLabel="Back"`.

**A text selector must match the whole node.** It bites hardest on a sentence with a value in the
middle: the referral hero renders as *one* node, so `'They start with 100 Care Points'` matches
nothing and `'.*They start with 100 Care Points.*'` matches. `?` is the other regular offender —
`'How are nannies vetted?'` is a regex whose `?` makes the `d` optional and then insists the string
ends, so it never matches a question that really ends in one. Escape it: `'…vetted\?'`.

**Airplane mode is how a flow goes offline.** `- setAirplaneMode: enabled` / `disabled` works on this
emulator and is what C10 uses; the JS bundle is already loaded, so only API calls fail. Coming back
is not instant — the radio takes a few seconds to reassociate, and a refetch that lands in that gap
fails again with nothing left to trigger another. Wrap the recovery in `- retry:`.

**The emulator is not reset between flows.** Every flow opens with
`runFlow: _launch.yaml`, which clears the app's own storage — that is what keeps
them order-independent.

## Google sign-in (C11–C14)

**C11** signs a mother up with Google from "Create your account" — the social
wizard's three steps, the phone linked onto the Google account, no email-code or
password screen — then signs out and back in with the same Google identity.
Its C16 tail then proves she can get a password: sign out again, reset by SMS
using the phone she linked, set a password on that same account, and sign back
in through the email door with it.
**C12** is collision B: a new Google identity types the seeded mother's number
on step 1, is sent to the sign-in screen (Welcome to NannyNow) with the number
prefilled and a banner, signs in by SMS, and only then has Google linked onto
her account.
**C13** is C11's nanny side: the same picker and locked/verified Step 1, then
the fork A10 proved for the phone wizard — nanny location, an ID upload, and
professional details — before the same final phone-link step, landing on the
vetting gate (PENDING_REVIEW) rather than a dashboard.
**C14** is collision A — the "email door", as opposed to C12's collision inside
the wizard: "Continue with Google" on the sign-in screen itself, with an
address that already has a password account, makes Firebase refuse the
credential (`auth/account-exists-with-different-credential`) before any wizard
runs. The same banner as C12 appears, but this flow proves ownership through
"Sign in with email" instead of an SMS code — `useSignInWithEmail` calls
`linkPendingCredential()` on success exactly the way `useConfirmPhoneSignIn`
does, so either door completes the link.

**The E2E Google picker is the one seam.** Google's own account sheet needs a
real Google account signed in on the device, and the lab's emulator has none
(nor should it — a flow cannot type a real Google password). So when the app
points at the Auth emulator (`extra.firebaseAuthEmulatorHost` is set — only
`e2e:metro` sets it), `getGoogleCredential` in `src/lib/socialAuth.ts` opens a
small modal instead ("Choose a test Google account", input
`e2eGooglePicker.email`, button "Use this Google account"), mounted by
`E2eGooglePickerHost` from the root layout. The typed address becomes
`GoogleAuthProvider.credential(JSON.stringify({ sub: 'e2e-<email>', email,
email_verified: true, name: 'E2E Google' }))` — an unsigned claim set the
emulator accepts in place of a Google ID token, and it does take the JSON form
straight from the native Android SDK (no unsigned-JWT wrapping needed). The
`sub` comes from the address, so the same address is the same Google identity on
every run. Everything after the credential — `signInWithCredential`, the
`/auth/me` 404 that marks a new person, the wizard, `linkWithCredential`,
`POST /auth/register` — is the production path. No real build mounts the picker.

**Accounts.** `SOCIAL_REGISTRATION` (`+201100000007`, `e2e-google-reg@…`) is
C11's throwaway mother, wiped by phone and email before every flow like
`REGISTRATION`. `SOCIAL_COLLISION` (`e2e-google-collide@…`) never gets a row: the
seeder deletes any Google-only Firebase account a crashed run left under that
address (an email-only `E2E_MOBILE_WIPE` entry), and `ensureFirebaseUser` unlinks
`google.com` from every seeded account — C12 links it onto the mother, and left
there it would sign straight into her account on the next run instead of
reaching the collision. `SOCIAL_NANNY_REGISTRATION` (`+201100000008`,
`e2e-google-nanny@…`) is C13's throwaway nanny, wiped the same way.
`EMAIL_DOOR_COLLISION` is not a separate identity at all — it is
`ACCOUNTS.mother.email` — because what C14 needs is exactly the `google.com`
unlink `ensureFirebaseUser` already does for every seeded account; there is
nothing extra to wipe.

**`emulator-providers`** is the advance step C12 and C14 both end on. "Google is
now linked" is exactly what no screen shows, so it asks the emulator directly
(`accounts:lookup` with the `Bearer owner` admin token) for the account behind
`OTP_PHONE`, and leaves `output.providers` (comma-joined provider ids) and
`output.hasGoogle` (`'true'` / `'false'`).

**Apple has no device coverage.** Sign in with Apple is iOS-only and this lab is
Android-only; it is on the manual test matrix in the social sign-in spec.

## Leftover resume (C15)

A "leftover" is a Firebase account with no `users` row at all — a sign-up that
stopped after Firebase created the account (she set a password, and it carries
a linked phone) but before `/auth/register` ever wrote the row. `useRootGate`
resumes this instead of starting fresh or signing her out: it seeds a
registration draft straight from the account (`seedDraftFromAccount`) and
opens role selection in "Finish setting up your account" mode. Locked-in
fields follow from what the account already proves — the phone (Step 1 shows
it disabled with "Already verified on your account", Step 3 skips the SMS
entirely) and, once she re-types the email a password is already registered
under, the create-password screen (`RegistrationEmailScreen` compares
`passwordEmail` against what she typed and skips ahead when they match).

**`LEFTOVER`** (`+201100000009`, `e2e-leftover@…`) is seeded differently from
every throwaway account above: `wipeAccount` frees it first (same as any
registration throwaway), then `E2E_MOBILE_LEFTOVERS` has the seeder create a
*fresh* Firebase user under that phone/email/password with `emailVerified:
false` and no `users` row — processed right after the wipe, so it is a new uid
every run. Nothing about this is idempotent the way `seedAccount` is, which is
why it is its own env var rather than another `E2E_MOBILE_WIPE` entry.

**A new native module needs a rebuild before any flow can run.** Metro only
delivers JS; the Google Sign-In module and the new `google-services.json` are
native. After adding one, run `npx expo prebuild --platform android --no-install`
from `apps/mobile` (never `--clean` over local native changes), then
`node e2e/build.mjs`. A stale APK fails the flow at the first call into the
missing module.

## Delete account (C17)

The Account tab's "Delete account" (`MotherProfileWalletScreen`, behind
`useConfirmDeleteAccount`) raises the app's themed confirm dialog
("Delete your account?" / "Delete account"), then `useDeleteAccount` sends
`DELETE /auth/me` with `{ confirm: 'delete-my-account' }` — the explicit body
real deletion requires; the two bodiless callers (`useDiscardUnfinishedAccount`,
the Google-collision cleanup) can never trip it. The backend scrambles the
row's email, phone and Firebase uid (`scrambleIdentity`,
`account-deletion.service.ts`) and hard-deletes the Firebase user; the app
clears its local session and shows a one-button "Account deleted" notice on
top of the sign-in screen it lands back on. C17 then signs in by SMS with the
same number to prove it is free: Firebase mints a fresh phone-only account for
the code check, `/auth/me` finds no row, and that throwaway is itself
discarded client-side — the same "We couldn't find an account for that
number" refusal an unregistered number gets.

**Both dialogs are `ConfirmDialogHost`, a `Modal`** — so, like the developer
menu in `_launch.yaml`, each hides everything behind it from Android's
accessibility tree. A flow must wait for one, act on it, and let it dismiss
*before* asserting on the screen underneath; asserting both at once fails on
whichever is currently covered, however plainly it shows in a screenshot.

**`ACCOUNTS.deletable`** (`+201100000010`, `e2e-delete-me@…`) needs none of
`REGISTRATION`/`LEFTOVER`'s special handling. A registration throwaway has to
be wiped because it leaves its *real* phone and email on the row it created;
deletion already scrambles both away and removes the Firebase user outright,
so the next run's `seedAccount` upsert-by-email simply finds nothing under
`e2e-delete-me@…` and creates a fresh row — exactly like every account in
`ACCOUNTS`. A run that fails before reaching deletion just leaves an ordinary
MOTHER row behind, which the same upsert finds and resets.

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

**A mother's ID upload (A11).** A10 and A11 were both described in the catalogue
as starting from role selection and walking the forms through to an ID upload.
A10 now does exactly that — the picker is short-circuited under E2E, see below.
A11 still starts from a seeded account in the state registration leaves it,
because its subject is the gate lifting *after* sign-up, not the wizard; what
registration itself decides is covered over HTTP in
`a11-mother-id-gate.test.ts`.

It is not only the ID upload. **Step 1 disables `Continue` until `draft.photoUri`
is set**, for a mother as well as a nanny, so *every* signup opens the picker on
the very first screen. That wall is gone: under E2E the picker is
short-circuited to a bundled placeholder (`lib/e2eImage`), and the accounts both
registration flows create are wiped by the seeder rather than upserted, so a run
does not mint an account per run. C2 and A10 now drive their whole wizards —
five steps for a mother, six for a nanny, including the email OTP each proves
mid-wizard against a code read out of Mailpit — and C7 rides on C2's step 5
rather than asserting `/referrals/validate` on its own.

**Anything about push tokens (C3).** No route exposes a user's device tokens,
so a flow cannot see whether registration happened — the app posts to
`/devices/push-token` and shows nothing for it, and releases it on sign-out
(`unregisterPushToken`, before `auth().signOut()`) equally silently. Both halves
are covered where they can be seen: `usePushNotifications.permission.test.ts`
(allow → registered, deny → nothing) and `useAuth.signOut.test.tsx` (the DELETE
goes out with the old user's JWT). Push itself *does* work on the lab: the
emulator registers real FCM tokens.

**The marketplace listing's moderation, from the app.** C5 does post a listing —
the photo is the bundled E2E placeholder (`lib/e2eImage`) and the upload goes to
the Storage emulator for real — but what happens to it afterwards (approval,
rejection, take-down, resubmission) is B6's subject and is driven from the
console, with the app's side advanced over HTTP.

**Anything an API journey already proves.** A4 does not re-derive when a promo
code's counter moves; A5 does not re-derive the ledger; A6 does not re-derive
hour accounting. Those are settled in `src/__integration__/journeys/`, against
the same database, far faster. The flows assert what is only true on a device:
that the discounted figure is the one the checkout page charges, that points
reserved before a nanny exists are applied without a tap once one accepts, and
that bought hours turn up where a mother would look for them.
