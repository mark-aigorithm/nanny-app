---
name: mobile-e2e-lab
description: Use whenever you touch the NannyApp mobile end-to-end (Maestro/Android) tests — running a flow, authoring or debugging one, bringing up or repairing the device lab, or making an app change E2E-able. Trigger on "mobile e2e", "run the e2e", "Maestro flow", "device lab", "a10/c02/c05/…", "emulator won't", "flow is failing", "test:e2e:mobile", or any request to add coverage for a mobile journey — even when the user just says "run the e2e tests" without naming the lab. Encodes the operating recipe and the hard-won traps (emulated-Wi-Fi host routing, service deaths, Metro's --clear race, the splash "hang" that is really connectivity) so a run reaches green without re-discovering them.
---

# NannyApp Mobile E2E Lab

Maestro drives the **real app on a real Android emulator** against the local test stack. A passing
flow means the production code path ran — real Firebase token, real PostGIS, real payment webhook,
real Storage upload. This skill is how you operate that lab from Claude Code on **this Windows
machine** and author flows that reach green, without re-paying for the traps that each cost an hour
the first time.

The in-repo harness reference is [apps/mobile/e2e/README.md](../../../apps/mobile/e2e/README.md) —
read it for what the flows and `advance.js` do. This skill is the **operational** layer: how to get
a run through, and what breaks.

## When you're asked to "run the e2e tests"

Do **not** just type `pnpm test:e2e:mobile` — nothing will be up. A flow needs six things alive:
PostGIS, the Firebase Auth+Storage emulator, the Paymob fake, the backend (`start:test`), Metro, and
a booted emulator. They die between sessions. The order that works, every time:

1. **Check what survived** — ports and the emulator. If it's all up and healthy, skip to step 6.
2. **Repair the lab** if anything is down → `references/environment.md` has the exact commands.
3. **Cold-boot the emulator**, then **disable its Wi-Fi** (the single most important step — see below).
4. **Bring up the services** (test:env → backend → Metro) — ideally in the same background shell that
   will run the flows, so nothing gets reaped between turns — and let **Metro fully build the bundle**
   before running, or the run races Metro's `--clear` crawl and dies.
5. **Verify reachability**: `curl` the backend (200) and, from the device, `nc 10.0.2.2 9099` (200).
6. **Run the flow** and watch the log. Then run it **a second time** — the README's rule; state that
   only the second run reveals (stale accounts, unwiped rows) is the most common real failure.

`references/environment.md` is the full runbook with copy-paste commands for every step, including
the WMI trick that keeps services alive across turn boundaries and how to recover when they die.

## The five traps that cost hours

These are not hypothetical — each one presented as a *different* symptom than its cause. Recognise
them by their disguise.

1. **The emulated Wi-Fi steals the route to the host.** After a cold boot the API-35 image brings up
   `wlan0` on the *same* `10.0.2.0/24` subnet as the SLIRP NAT `eth0`, with no default route — so
   packets to the host alias `10.0.2.2` (backend, Auth/Storage emulator, Paymob) leave via `wlan0`,
   which has no path to the host. Every request dies as `Network is unreachable` /
   RNFirebase `[auth/unknown] Failed to connect to /10.0.2.2:9099`. **Fix:** `adb shell svc wifi
   disable` (now baked into `run.mjs`'s `quietDeviceChrome`, but a manual cold boot needs it too).
   The tell that it's *this* and not an app bug: the app reaches the welcome screen fine (Firebase's
   first `onAuthStateChanged(null)` is local, no network) but the first real network call fails.
   **Worse variant:** no `eth0` at all and `Active default network: none` — then `svc wifi disable`
   does nothing and only `adb reboot` brings the interface back. `nc` tells them apart: `Network is
   unreachable` = route/interface, `Timeout` = route fine and the *service* is dead.

2. **A "hang on the splash" is almost never a hang.** Three causes: the developer-menu modal covering
   the welcome screen (Android drops content behind a modal out of the a11y tree, so `uiautomator
   dump` shows *zero text*); trap #1 (no host route); or **Metro died** — fonts are Metro-served
   assets, so a dead bundler holds the native splash forever with no red box and no logcat error.
   Screenshot, `curl :8081/status`, and check `adb shell dumpsys window | grep mCurrentFocus` before
   believing the app is stuck. An **actual** app ANR shows `mCurrentFocus=…Application Not Responding`.

3. **Lab services die on their own** (memory pressure, turn boundaries) — including ones started via
   WMI, which is *supposed* to outlive a turn and often doesn't. A repair often leaves only PostGIS
   and Mailpit (detached Docker) up. Don't debug the flow — check the ports first, and prefer the
   one-shell recipe in `references/environment.md` that owns the services and the runs together.

4. **Metro's first bundle is a landmine.** `e2e:metro` starts with `--clear`, so the first request
   pays for the whole ~50s build, and `run.mjs`'s `warmMetro` can time out or crash Metro mid-crawl
   (`exit status 1` at ~57%). Let Metro finish building — watch its log to 99.9% or `curl` the
   `.virtual-metro-entry.bundle` to a `200` — **before** launching a flow.

5. **A killed emulator wedges.** A stale qemu holds the AVD lock and every re-boot exits instantly;
   or `-gpu host` mid-run wedges under load (orphaned `node`/`java` starving it). Kill qemu, clear
   the AVD locks, kill orphans, cold-boot. Details and commands in `references/troubleshooting.md`.

`references/troubleshooting.md` is the symptom → cause → fix table for these and the smaller ones
(PATH stripping, the `find.exe` shadowing, the broken-pipe crash when piping `run.mjs` through
`grep`, the SystemUI ANR).

## Authoring or extending a flow

The mental model, and the reason the suite is cheap: **Maestro drives exactly one surface — the app,
signed in as one person.** Everything the app cannot do to itself (the nanny accepting, the admin
approving, a code the emulator "sent", a second actor hitting capacity) happens over the same HTTP
the other suites use, in `e2e/scripts/advance.js`, which runs on the host in Maestro's JS sandbox.

Before writing a step, know these — they are the difference between a flow that passes and one that
fails on a selector that is plainly on screen. Full detail in `references/authoring-flows.md`:

- **Selectors:** prefer visible copy (Maestro matches `accessibilityLabel` as text). Add a `testID`
  only where copy repeats, is a live price, or the control is an unlabelled icon. Maestro matches a
  text selector as a **regex against the node's entire text** — use `.*` for partial matches.
- **OTP boxes:** `OtpCodeInput`'s real input is a 1×1 offscreen field Android prunes; tap
  `${testID}.boxes` (the visible row) to focus it, then `inputText`.
- **Photos:** the registration/listing/ID pickers short-circuit to a bundled placeholder under E2E
  (`lib/e2eImage`), so a flow never touches the Android picker but still drives a real Storage-emulator
  upload. Wait for the filled-state signal (`Change` / `Remove photo`) before submitting.
- **Codes:** phone codes are read off the Auth emulator (`advance.js phone-otp`, keyed by the E.164),
  email codes off Mailpit (`email-otp`). Both leave `output.*` for the flow to type.
- **Accounts:** flows sign in as fixed seeded accounts (`accounts.mjs`); the seeder upserts them and
  links each phone number onto the email/password uid. Registration flows use a **throwaway** account
  the seeder **wipes** (by phone) before each run, or the second run collides on the unique phone.
- **Stateful screens:** a screen kept in the nav stack (e.g. CreatePostScreen) retains field state
  between opens — `eraseText` before `inputText`.
- **Run to green by watching it fail.** Selectors, wall-clock formats and cache-busting relaunches
  are found by running the flow and reading the failure screenshot, not by reading code. Poll the log
  (redirect to a file — never pipe `run.mjs` through `grep`), read the Maestro debug screenshot at
  `~/.maestro/tests/<ts>/<flow>/screenshots/` on failure, fix, re-run.

## Making an app change E2E-able

If a journey can't be driven (system UI, a missing seam), the fix is usually a tiny, production-safe
affordance gated on the E2E flag, **not** a test hack:

- A picker that opens system UI → return a bundled placeholder when the Storage-emulator host is set
  (`lib/e2eImage`), so the real upload still runs.
- A control with no stable selector → add a `testID` (`<screen>.<element>`) or an
  `accessibilityLabel` — the latter doubles as real a11y.
- A second actor or an out-of-band code → add an `advance.js` step over HTTP, never a bypass in the
  app.

## Verify like it counts

A flow is not done until it passes **twice in a row** on the live lab. Report the tally from the log
(`N/N flows passed`), and for a UI change, confirm the real effect (a screenshot, the DB row via a
host `curl`, the webhook) — not just that a selector appeared.

## Where the knowledge lives

- `references/environment.md` — the full startup/repair runbook, exact commands, ports, WMI, logs.
- `references/troubleshooting.md` — every symptom → cause → fix, most-costly first.
- `references/authoring-flows.md` — the cross-surface model, `advance.js` catalogue, account/seed
  model, selector patterns, the DOB dialog and map/geo-fix specifics.
- [apps/mobile/e2e/README.md](../../../apps/mobile/e2e/README.md) — the in-repo harness reference.
- The `mobile-device-lab` auto-memory carries the machine-specific facts that the repo can't.
