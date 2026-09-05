# The lab: environment, startup, and repair

Exact, copy-paste commands for this Windows machine. Paths and quirks are specific to it; the
`mobile-device-lab` auto-memory is the canonical record and may be newer than this file.

## Table of contents
- [What must be running](#what-must-be-running)
- [The PATH prelude](#the-path-prelude-run-it-in-every-bash-call)
- [Health check first](#health-check-first)
- [Full cold start](#full-cold-start)
- [Why WMI, and how services die](#why-wmi-and-how-services-die)
- [Running a flow](#running-a-flow)
- [Polling a run](#polling-a-run)

## What must be running

| Service | Port | Started by |
|---|---|---|
| PostGIS (`nannyapp_test`) | 55432 | `pnpm test:env` (docker, detached — survives most crashes) |
| Firebase Auth emulator | 9099 | `pnpm test:env` (concurrently) |
| Firebase Storage emulator | 9199 | `pnpm test:env` |
| Paymob fake | 4010 | `pnpm test:env` |
| Mailpit (SMTP 1025 / HTTP 8025) | 8025 | `pnpm test:env` (docker) |
| Backend under test | 3001 | `pnpm --filter @nanny-app/backend start:test` |
| Metro | 8081 | `pnpm --filter @nanny-app/mobile e2e:metro` |
| Android emulator (`nanny-e2e` AVD) | — | `emulator -avd nanny-e2e -gpu host …` |

`pnpm test:env` runs `test:env:free` (reaps strays on 9099/4400/4500/4010) → `test:env:up` (docker
`--wait`) → `concurrently --kill-others` the Auth/Storage emulator **and** the Paymob fake. Because
of `--kill-others`, if the emulator or Paymob dies the whole `test:env` process exits (PostGIS
stays — it's detached docker).

## The PATH prelude (run it in every Bash call)

The Bash tool's PATH is sometimes stripped to almost nothing. Prefix every command:

```bash
export PATH="/usr/bin:/c/Windows/System32:/c/Windows:/c/Program Files/nodejs:/c/Users/markb/AppData/Roaming/npm:/d/Docker/resources/bin:/c/Users/markb/AppData/Local/Android/Sdk/platform-tools:/c/Users/markb/AppData/Local/Android/Sdk/emulator:/bin:$PATH"
```

- **`/usr/bin` must come first** or `find`/`sort` resolve to Windows' `find.exe`/`sort.exe` and
  silently misbehave (`find … | wc -l` returns 0).
- **Docker Desktop is on `D:\Docker`**, so its CLI is `/d/Docker/resources/bin`.
- `gh` for pushes lives at `/c/Program Files/GitHub CLI`; git at `/c/Program Files/Git/bin`.

## Health check first

```bash
echo "backend $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/health) metro $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/status)"
netstat -ano | grep LISTENING | grep -E ':(55432|9099|9199|4010|3001|8081) ' | awk '{print $2}' | sort -u
adb devices
adb shell dumpsys wifi 2>/dev/null | grep -oiE 'Wi-Fi is (enabled|disabled)' | head -1
# device -> host reachability (THE check that matters):
adb shell 'echo -e "GET / HTTP/1.0\r\n\r\n" | toybox nc -w 3 10.0.2.2 9099 2>&1 | head -1'
```

All six ports up + `HTTP/1.1 200 OK` from the device `nc` + Wi-Fi **disabled** → the lab is ready,
run the flow. Anything missing → repair below.

## Full cold start

Kick off the long-lead items (Docker, emulator) via WMI so they survive turn boundaries, clean
orphans, then bring up services. **Do these as separate Bash calls, polling between.**

### 1. Docker + orphan cleanup + emulator (parallel)

```bash
# Start Docker Desktop (cold start ~1-2 min)
powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='\"D:\Docker\Docker Desktop.exe\"'} | Out-Null; 'docker starting'"
# Kill orphaned lab node/java (only when nothing is listening on the lab ports)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='java.exe'\" | Where-Object { \$_.CommandLine -match 'jest-worker|firebase|ts-node|start:test|test:env|e2e:metro|expo|@nanny-app|paymob|metro|with-emulator' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; 'orphans cleaned'"
# Cold-boot the emulator (warm snapshots wedge; -no-snapshot-load is reliable)
powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd /c C:\Users\markb\AppData\Local\Android\Sdk\emulator\emulator.exe -avd nanny-e2e -gpu host -no-boot-anim -no-snapshot-load -no-snapshot-save > C:\Users\markb\AppData\Local\Temp\claude\emu.log 2>&1'} | Out-Null; 'emulator booting'"
```

Note: the 12 `jest-worker` processes you'll see while Metro runs are **Metro's own transformer pool**,
not orphans — only clean when the lab ports are dead.

### 2. Wait for boot, then DISABLE WI-FI (critical)

```bash
sleep 60
adb devices; adb shell getprop sys.boot_completed        # want: 1
docker info 2>&1 | grep -i 'Server Version'              # want: a version
# THE fix without which nothing reaches the host after a cold boot:
adb shell svc wifi disable
adb shell ip route                                       # want: a single 10.0.2.0/24 via eth0
adb shell 'echo -e "GET / HTTP/1.0\r\n\r\n" | toybox nc -w 3 10.0.2.2 9099 2>&1 | head -1'  # want: 200
```

(`run.mjs`'s `quietDeviceChrome` also runs `svc wifi disable` before each suite, so a run via
`run.mjs` is covered — but a manual boot you drive yourself is not.)

### 3. test:env, then backend + Metro

```bash
# test:env FIRST (backend needs the DB + emulator)
powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd /c cd /d D:\Projects\nanny-app && pnpm test:env > C:\Users\markb\AppData\Local\Temp\claude\testenv.log 2>&1'} | Out-Null; 'test:env up'"
# wait ~45s, confirm 9099/9199/4010 listening, then:
powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd /c cd /d D:\Projects\nanny-app && pnpm --filter @nanny-app/backend start:test > C:\Users\markb\AppData\Local\Temp\claude\backend.log 2>&1'} | Out-Null; 'backend up'"
powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd /c cd /d D:\Projects\nanny-app && pnpm --filter @nanny-app/mobile e2e:metro > C:\Users\markb\AppData\Local\Temp\claude\metro.log 2>&1'} | Out-Null; 'metro up'"
```

**Write log paths as full `C:\…` paths inside the WMI command** — `$env:TEMP` does not expand under
`cmd /c` and you'll write to a literal `$env:TEMP` file and be blind.

### 4. Let Metro finish the first bundle before running

`e2e:metro` uses `--clear`; the first build is ~50s and `run.mjs` will fail with "Metro is listening
but cannot build a bundle" if it races the crawl. Warm it explicitly:

```bash
curl -s -m 200 -o /dev/null -w "bundle -> %{http_code} in %{time_total}s\n" \
  "http://127.0.0.1:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&hot=false&transform.engine=hermes"
# want a 200; a second fetch should return 200 in <1s (cached)
```

## Keeping the services alive — prefer one shell

Long-running services started from the Bash tool (`nohup … &`, `run_in_background`, `cmd /c start`)
are **reaped at turn/session boundaries** because they stay in the shell's Windows job object.

**The recipe that holds: one background Bash call owns the whole lab.** Services stay children of
that shell for its entire life, and the flow runs inside the same call. Write it to a file and run it
with `run_in_background: true`:

```bash
#!/usr/bin/env bash
S=/c/Users/markb/AppData/Local/Temp/claude   # somewhere to keep the logs
export PATH="/c/Users/markb/AppData/Local/Android/Sdk/platform-tools:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
export MAESTRO_BIN='C:\Users\markb\AppData\Local\maestro\bin\maestro.bat'
cd /d/Projects/nanny-app || exit 1

pnpm test:env                                  > "$S/testenv.log" 2>&1 &   ; sleep 55
pnpm --filter @nanny-app/backend start:test    > "$S/backend.log" 2>&1 &   ; sleep 30
pnpm --filter @nanny-app/mobile e2e:metro      > "$S/metro.log"   2>&1 &   ; sleep 40

# Metro's --clear crawl, paid for up front (see trap #4)
curl -s -m 300 -o /dev/null -w "bundle %{http_code} in %{time_total}s\n" \
  "http://127.0.0.1:8081/.expo/.virtual-metro-entry.bundle?platform=android&dev=true&hot=false&transform.engine=hermes"
adb shell svc wifi disable
adb shell 'echo -e "GET / HTTP/1.0\r\n\r\n" | toybox nc -w 4 10.0.2.2 9099 2>&1 | head -1'  # want 200

node apps/mobile/e2e/run.mjs c02 > "$S/c02-run1.log" 2>&1; echo "RUN1=$?"
node apps/mobile/e2e/run.mjs c02 > "$S/c02-run2.log" 2>&1; echo "RUN2=$?"
sleep 900   # keeps the services up for follow-up runs from other Bash calls
```

While that keeper shell is alive you can fire further `run.mjs` calls from separate Bash
invocations — Maestro must run from the Bash tool either way.

**WMI is the fallback, and it is not reliable here.** `Win32_Process.Create` makes the parent
`WmiPrvSE`, which *should* outlive a turn, and sometimes does. Observed 2026-09-05: `test:env`, the
backend and Metro were each started this way, served real traffic for 2–8 minutes, then all exited
`1` with no error in their logs — repeatedly, across three attempts. Don't spend the session
re-diagnosing it; use the one-shell recipe. (Metro under WMI can also exit within seconds of
"Logs for your project will appear below" — the same silent `Exit status 1`.)

If a run reports "No backend answering" or the flow can't reach 9099, **check the ports before
touching the flow** — the usual state is "only PostGIS and Mailpit (detached docker) survived".
Recovery: re-run `pnpm test:env` (idempotent; `test:env:free` reaps first), then backend, then Metro,
then re-warm the bundle.

## Running a flow

Maestro must run from the **Bash tool** (not WMI), backgrounded to survive the 10-min Bash cap:

```bash
export PATH="/usr/bin:/c/Windows/System32:/c/Windows:/c/Program Files/nodejs:/c/Users/markb/AppData/Roaming/npm:/c/Users/markb/AppData/Local/Android/Sdk/platform-tools:/bin:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000            # this emulator needs it
export MAESTRO_BIN="C:\\Users\\markb\\AppData\\Local\\maestro\\bin\\maestro.bat"
cd /d/Projects/nanny-app
node apps/mobile/e2e/run.mjs c01 > "C:/Users/markb/AppData/Local/Temp/claude/c01.log" 2>&1
echo "EXIT=$?"
```

Run with `run_in_background: true`. `run.mjs <name>` matches by prefix; omit the name to run all
flows. It re-seeds before **every** flow (so each is runnable alone and in any order) and checks all
prerequisites, naming the missing command.

## Polling a run

```bash
# Redirect to a file and grep the FILE — never pipe run.mjs through grep (broken-pipe crash).
grep -nE 'COMPLETED|FAILED|flows passed|failed:' "C:/Users/markb/AppData/Local/Temp/claude/c01.log" | tail -20
```

On failure, the Maestro debug screenshot is the fastest diagnosis:
`~/.maestro/tests/<timestamp>/<flow>/screenshots/step-NNN-*.png` — `Read` it.
