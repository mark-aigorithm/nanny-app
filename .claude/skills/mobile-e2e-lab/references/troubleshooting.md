# Troubleshooting: symptom → cause → fix

Ordered by how much time the symptom wastes when you don't recognise it. The recurring theme: **the
symptom disguises the cause.** A connectivity failure looks like an app hang; a stale account looks
like a broken assertion; a busy machine looks like a broken GPU.

## RNFirebase `auth/unknown`, or the flow can't reach the backend/emulator

**Symptom.** Sign-in shows "Auth error: auth/unknown"; logcat says
`[auth/unknown] … Failed to connect to /10.0.2.2:9099`. Or a device `nc 10.0.2.2 <port>` returns
`Network is unreachable`. Often after a cold boot.

**Cause.** The API-35 google_apis image brings up emulated Wi-Fi (`wlan0`, mac80211_hwsim) on the
**same `10.0.2.0/24` subnet** as the SLIRP NAT `eth0`, with **no default route**. Packets to the host
alias `10.0.2.2` can leave via `wlan0`, which has no path to the host. `eth0` is the only interface
that reaches `10.0.2.2`.

**Fix.** `adb shell svc wifi disable`. Confirm `adb shell ip route` shows a single `10.0.2.0/24 dev
eth0` and the device `nc` returns `200`. Baked into `run.mjs quietDeviceChrome`, but a manual cold
boot needs it. **Diagnostic tell:** the app reaches the welcome screen (Firebase's first
`onAuthStateChanged(null)` is local) but the first real network call fails — so it looks like a
mid-startup app bug, not connectivity.

## The device has no network at all (a different failure from the Wi-Fi trap)

**Symptom.** `adb shell ip -o addr show` lists only `lo` and `dummy0` — **no `eth0`** — and
`adb shell dumpsys connectivity | grep "Active default network"` says `none`. Every host address is
`Network is unreachable`, and `svc wifi disable` / `svc data enable` change nothing.

**Cause.** The AVD came up without its SLIRP NAT interface. Seen after resuming a snapshot and then
force-killing qemu; the routing tables are left with only Android's `dummy0` fallback, which returns
ENETUNREACH for everything.

**Fix.** `adb reboot`, wait for `sys.boot_completed=1`, then `svc wifi disable` again. That restores
`eth0` with `10.0.2.15/24`. A cold boot (`-no-snapshot-load`) alone did **not** fix it — the reboot
of the running device did.

**The `nc` result tells you which failure you have:**

| `toybox nc 10.0.2.2 <port>` says | Means |
|---|---|
| `Network is unreachable` | No route or no interface — Wi-Fi trap above, or this one |
| `Timeout` / `Connection refused` | Routing is **fine**; that service is dead — check `netstat` |
| `HTTP/1.1 200 OK` | Device→host is healthy |

Cross-check against a service you know binds `0.0.0.0` (Mailpit on 8025, docker): if 8025 answers and
9099 times out, the route is fine and the Firebase emulator is simply down.

## The app "hangs on the splash"

**Symptom.** After `openLink`, `_launch` fails asserting the welcome copy; a screenshot shows the bare
splash logo and `uiautomator dump` finds no text.

**Three causes, check all.**
1. The dev-client **developer-menu modal** is covering the welcome screen. Android drops content
   behind a modal out of the a11y tree, so it's genuinely invisible to Maestro however plainly it
   shows in a screenshot. `_launch` dismisses it (Continue → back).
2. **No host route** (the Wi-Fi trap above) — the root gate is stuck fetching `/auth/me`.
3. **Metro died.** `RootLayout` holds the native splash until `useFonts` resolves, and the fonts are
   Metro-served assets in a debug build — so a dead bundler is a permanent splash with **no red box
   and no logcat error**. The JS already running keeps printing (the RNFirebase deprecation warnings
   still appear), which makes it look alive. `curl 127.0.0.1:8081/status` before anything else; its
   log ends in a bare `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … Exit status 1`.

**Distinguish.** `adb shell dumpsys window | grep mCurrentFocus`. A real app ANR reads
`mCurrentFocus=…Application Not Responding: com.nannyapp.mobile`. If it's the launcher, the deep-link
VIEW intent was dropped (see below). If it's MainActivity but no text renders, it's the modal or the
route.

## Lab services died / "No backend answering"

**Symptom.** `run.mjs` fails at a prerequisite check; a port that was up is gone. Common after a
reboot cycle or a long pause — often only PostGIS (detached docker) survives.

**Cause.** Services started outside WMI get reaped at turn boundaries; any service dies under memory
pressure; `test:env`'s `concurrently --kill-others` tears down the emulator + Paymob together if
either exits.

**Fix.** Check ports **before** touching the flow. Re-run `pnpm test:env` (idempotent), then backend,
then Metro, then re-warm the bundle. See `environment.md`. Don't debug a flow against a dead stack.

## Metro is listening but "cannot build a bundle" / Metro exits mid-build

**Symptom.** `run.mjs` prints "Metro is listening but cannot build a bundle (no response at all)"; or
`metro.log` shows the bundle reaching ~57% then `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … Exit status 1`.

**Cause.** `e2e:metro` starts with `--clear`; the first bundle is ~50s, and `warmMetro`'s fetch (or a
flow launch) racing that crawl times out or crashes Metro. `/status` answers 200 the whole time, so a
liveness ping can't tell a building Metro from a broken one.

**Fix.** Restart Metro, then `curl` the `.virtual-metro-entry.bundle` with `-m 200` and wait for the
`200`; confirm a second fetch is `<1s` (cached). Only then run a flow.

## Emulator boots then exits instantly / re-boot exits with code 0

**Symptom.** `emulator …` prints "Increasing RAM size…" then `[exited with code 0]`, no device.

**Cause.** A killed emulator left a qemu holding the AVD lock
(`~/.android/avd/nanny-e2e.avd/{multiinstance.lock,hardware-qemu.ini.lock}`).

**Fix.** `taskkill //F //IM qemu-system-x86_64.exe`, then `rm -rf` the two lock paths (they re-create
on the real boot), `adb kill-server && adb start-server`, cold-boot with `-no-snapshot-load`. If adb
itself hangs, the qemu is wedged — taskkill + reboot.

## `-gpu host` wedges mid-run (`DeviceServerDiedException`, heartbeat failures)

**Symptom.** A flow fails mid-step with `DEADLINE_EXCEEDED` during `inputText`, preceded by
`Failed to record heartbeat`; a wall of `gles_v2_imp.cpp … error 0x501` then exit 139.

**Cause.** Machine load — orphaned `node`/`java` (jest-workers that "failed to exit gracefully",
orphaned services holding ports) starving the GPU. Not the GPU itself; on a clean machine a warm
`-gpu host` survives a full flow.

**Fix.** Kill lab orphans (see `environment.md`), cold-boot, re-run. `swangle_indirect` never boots
on this machine; `swiftshader_indirect` never finishes booting — `-gpu host` is the only option.

## The deep-link launch does nothing (stuck on the launcher)

**Symptom.** `_launch` or `_relaunch` fails; the screenshot is the Android launcher, not the app.

**Cause.** The `openLink` VIEW intent is occasionally dropped (dev-launcher not fully up, or the
intent lost). `_relaunch` wraps this in a `retry`; `_launch` does not.

**Fix.** Re-run the flow — it's a transient. If it repeats every time, the dev-client bundle isn't
being served (Metro not warm).

## "System UI isn't responding" ANR covers the app

**Symptom.** Every flow fails at `_launch`'s developer-menu assert; the menu is visible behind an ANR
dialog in the screenshot.

**Cause.** The AVD has `hw.ramSize = 1536M`; SystemUI ANRs and the dialog holds focus across runs.

**Fix.** `adb shell dumpsys window | grep mCurrentFocus` to confirm, then dismiss by tapping **Wait**:
`adb shell input tap 320 1363` (at 1080×2400).

## A flow passes on run 1, fails on run 2 (or vice-versa)

**Symptom.** State-dependent flakiness.

**Cause.** The DB is **never truncated** and shared with the admin suite. A post/booking/listing from
a prior run lingers under the same title; a registration account collides on its unique phone; the
Auth/Mailpit code list isn't cleared.

**Fix.** This is a **flow-authoring** bug, not the lab. Reset the actor's own rows at the top
(`community-reset`, the seeder wipe), assert on this-run-unique data, count either side of an action
rather than asserting an absolute. Always verify a flow **twice in a row** before calling it done.

## Small Bash traps

- **PATH stripped** to nothing (no `grep`/`node`/`docker`) → use the PATH prelude in `environment.md`.
- **`find`/`sort` misbehave** (`find … | wc -l` returns 0) → `/usr/bin` isn't first in PATH; Windows'
  `find.exe`/`sort.exe` shadowed them.
- **`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) … async.c` / exit 3221226505** → you
  piped `node run.mjs` through `grep`/`head`; the early-closed pipe crashes it. Redirect to a file,
  grep the file.
- **A stale log shows a port "listening" for a dead process** → confirm with `netstat -ano | grep
  ':<port> '`, not the log.
- **`adb` device paths get mangled** by Git Bash: `adb shell screencap -p /sdcard/x.png` rewrites
  `/sdcard/…` to a Windows path and prints screencap's usage banner. Prefix `MSYS_NO_PATHCONV=1`.
  And `adb pull` needs a **`C:\…`** destination — a `/c/Users/…` one fails with "cannot create
  file/directory".

## Seeing the live screen (not Maestro's debug shot)

When you need the device's state *now* — mid-run, or after a failure to check whether it recovered:

```bash
MSYS_NO_PATHCONV=1 adb shell screencap -p /sdcard/shot.png
MSYS_NO_PATHCONV=1 adb pull /sdcard/shot.png 'C:\Users\markb\AppData\Local\Temp\claude\shot.png'
```

Then `Read` the PNG. Pair it with `adb shell dumpsys window | grep mCurrentFocus` — the screenshot
says what is drawn, the focus says what owns input (a modal or ANR the screenshot can't distinguish).
