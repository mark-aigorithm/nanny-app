---
name: ui-sweep
description: Use after implementing (or substantially changing) any NannyApp mobile feature — a new screen, sheet, dialog, form, card, list or step in a flow — before calling it done, to screenshot every state of it across small/S25 phones, font 1.0/1.3 and 3-button/gesture navigation and check it against the layout rules. Trigger on "UI sweep", "ui-sweep", "check the UI", "sweep the new feature", "does it fit on small phones", "check font scale / keyboard / nav bar", or when finishing a mobile UI task even if the user didn't ask for a sweep. Not for backend-only or admin-console work.
---

# UI sweep for a new mobile feature

Maestro E2E checks text in the accessibility tree, so text that is clipped, covered by the keyboard,
or sitting under the navigation bar still passes. It also runs at one size and one font scale. The
first full sweep (Oct 2026) found buttons under the Android nav bar, fields hidden by the keyboard and
cut-off times on screens that all passed E2E. This skill makes a new feature go through the same
check before it ships.

The harness already exists. Read these before starting:
- `apps/mobile/CLAUDE.md` → **"Rules from the UI sweep"**. This is the checklist you review against.
- `apps/mobile/e2e/README.md` → **"UI sweep"**. It covers the runner, the matrix, flags and output.
- The `mobile-e2e-lab` skill, to bring the lab up (backend, Metro, emulator) and for its traps.

## 1. List what the feature puts on screen

Before touching a flow, write down every state of the feature a user can see, for each role that
sees it:
- the empty, filled, loading, error and success states;
- each step of a multi-step flow, and the screen it lands on afterwards;
- with the keyboard open, for every input (the focused field and its submit button);
- scrolled to the end, for anything taller than a small phone (360×640 dp);
- sheets and dialogs, open, with their keyboard if they have inputs;
- where it shows up elsewhere: Home cards, Activity, notifications, badges.

A state you don't screenshot doesn't get checked.

## 2. Cover those states with a sweep flow

Sweep flows live in `apps/mobile/e2e/flows/sweep/`. If an existing `sNN-*.yaml` already passes through
the feature's screens, add `takeScreenshot` steps there. Otherwise add `sNN-<feature>.yaml` with the
next free number. Copy the shape of a neighbouring flow: `runFlow: ../_launch.yaml`, seeding over
HTTP with `../../scripts/advance.js` for the other actor, then `../_sign-in.yaml`.

Authoring rules. Each one cost a failed run to learn:
- **Name shots bare:** `- takeScreenshot: sNN-MM-<state>`, and end keyboard shots with `-kbd`.
  Maestro 2.11 refuses a path outside its own output folder; the runner collects the files.
- **Put `waitForAnimationToEnd` before every shot,** keyboard shots especially. Otherwise the shot
  catches a half-open keyboard, and the next `hideKeyboard` runs before the keyboard arrives and
  leaves it up.
- **Never tap by screen position.** A percentage lands somewhere different in each cell. Use text,
  `accessibilityLabel` or a `testID`.
- **For anything that may be below the fold, use `runFlow: { file: _tap.yaml, env: { TARGET: '…' } }`**
  (or `_tap-id.yaml` with `TARGET_ID`), which scrolls it to the centre first. Maestro never scrolls
  before a tap, and it counts an element behind a sticky footer as visible, so a plain `tapOn` hits
  the footer. Tap a sticky footer button (`Continue`) directly.
- **Checkout:** use `_pay.yaml`, not `../_pay-checkout.yaml`, which can't reach Pay at 1.3.
- **When `hideKeyboard` leaves the keyboard up,** `pressKey: Enter` closes a one-line field. Never
  follow it with another `hideKeyboard`, because on a closed keyboard that presses Back.
- **Swipe in the side margin** (`start: '3%, 60%'`, `end: '3%, 20%'`) on screens with a map or a
  multiline input in the middle. Those take a centred swipe instead of the page.
- **Wait on something that stays put,** such as a header title or a sticky button. A step label or a
  heading can scroll away at 1.3.
- If the flow has to step around an app bug to reach the next screen (a button under the nav bar),
  do that **and leave a comment saying it is a finding**. The bug still goes in the report.
- Run `~/.maestro/bin/maestro check-syntax <flow>` on every flow you touch.

## 3. Run it

The emulator, Metro and backend are **shared** with other chats. Before touching the device, check
for an E2E run (`tmux has-session -t nanny-app-e2e`, `pgrep -fa "e2e/run.mjs|ui-sweep.mjs"`) and
don't start yours while one is running. The lab uses Paymob fake mode, with Metro on 8090; port 8081
belongs to another project.

Start with the worst cell and the default phone. That catches most problems in about 10 minutes per
flow:

```bash
tmux new -d -s nanny-app-ui-sweep-run "cd /home/mark/projects/nanny-app/apps/mobile && \
  E2E_METRO_PORT=8090 node e2e/ui-sweep.mjs --paymob=fake \
  --cells=small-1.3-3btn,large-1.0-gesture --flows=sNN 2>&1 | tee ~/logs/nanny-app-ui-sweep-run.log"
```

Tell the user the session name and the log path. For a feature that adds several screens, or before
a release, run the flow across all 8 cells (drop `--cells`). `--cells` and `--flows` take prefixes;
`--into=<run folder>` re-runs failed pairs into an existing contact sheet.

**A failed flow** leaves `<cell>/sNN-zz-FAILED.png`. Read it before changing anything.
- If the flow is wrong (a stale selector, a missing scroll), fix the flow.
- If the app is wrong, it's a finding. Get the flow past it (step 2) and record it.
- Re-run until every pair completes.

**Device state:** the runner changes the size, density, font scale and nav mode, and restores them
at the end, also on Ctrl+C. If the emulator dies mid-run, the next run refuses to start and prints
the reset commands. Run those; don't work around the guard.

## 4. Review every screenshot

Output goes to `apps/mobile/e2e/ui-sweep-output/<timestamp>/` (gitignored): one folder per cell,
plus `index.html`. **Compare each screen across cells.** Most bugs exist in only one or two of them.
Check every shot against "Rules from the UI sweep":

- anything the user needs under the navigation bar or gesture handle, a sticky footer, a tab bar, a
  floating button or the status bar;
- with the keyboard open, the focused field or its submit button hidden, or a band of padding left
  behind once the keyboard closes;
- sheets or dialogs taller than the screen, with their actions cut off;
- truncated times, amounts, names or titles, and units split across lines ("10/13/202" / "6",
  "−EGP" / "120.00", "+20" / "110…");
- enabled buttons that look disabled, and tap targets under 44 dp;
- copy and state that contradict another screen (status names, times, totals, counts), or an empty
  state with no way forward.

Reading images: the session drops images after about 80–100 reads per agent ("media removed: request
limit"). With more shots than that, hand them to subagents in batches of at most ~80, and tell each
one to read no more than 3 images per message. Spot-check every High finding yourself before
reporting it.

## 5. Fix what's yours, report the rest

- **Defects in the feature you are building:** fix them in the code as part of the feature, following
  the rules, then re-run the sweep for that flow until the shots are clean. They are part of the
  work, not a separate request.
- **Defects in screens the feature didn't touch:** report them, don't fix them unasked.
- **Report:** for each finding give its severity (High = hides or blocks something the user needs;
  Medium = clearly broken or confusing; Low = polish), the cells it appears in, one or two
  sentences, and the screenshot path. Say what the sweep could not show:
  - the photo picker and crop screen, and the Google sheet (E2E swaps in a placeholder,
    `src/lib/e2eImage.ts`);
  - Apple sign-in and the OS permission prompts;
  - any state your flow didn't reach.
- If a finding exposes a new class of bug, add a one-line rule to "Rules from the UI sweep" so the next
  feature doesn't repeat it.

To share results with someone, build an HTML page with the shots embedded as downscaled JPEG data URIs
and publish it as an Artifact. A full contact sheet is about 1,270 PNGs and 160 MB, so it can't be
published as files. No ImageMagick or PIL is installed here; headless Chromium (Playwright, from
`apps/mobile`) can draw each PNG to a canvas and export `image/jpeg`.
