#!/usr/bin/env node
/**
 * The UI sweep: drives every screen a mother and a nanny can reach, across a
 * small device matrix, and screenshots each one into a contact sheet.
 *
 * Not a pass/fail test. The Maestro suite (run.mjs) checks text in the
 * accessibility tree, which still counts clipped or covered text as visible,
 * and it runs at one size and one font scale. The sweep exists so a person (or
 * an agent) can *look* at every screen at the sizes, font scales and
 * navigation modes real phones use.
 *
 *   node e2e/ui-sweep.mjs --paymob=fake
 *   node e2e/ui-sweep.mjs --paymob=fake --cells=small-1.3-3btn --flows=s04,s05
 *   node e2e/ui-sweep.mjs --paymob=fake --into=2026-10-13_03-12-34 --cells=small-1.0-3btn --flows=s02
 *                                                # re-run into an earlier run's folder
 *   node e2e/ui-sweep.mjs --paymob=fake --ai     # also assertNoDefectsWithAI
 *                                                # (needs a Maestro Cloud login;
 *                                                # sends screenshots to Maestro)
 *
 * Needs the same lab as run.mjs (see e2e/README.md). Writes to
 * e2e/ui-sweep-output/<timestamp>/ — one folder per matrix cell plus
 * index.html — and puts the device back the way it found it, also on Ctrl+C.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withoutPaymobFlag } from '../../../test-support/paymob/mode.mjs';

import { fail } from './android.mjs';
import { runMaestro } from './lab.mjs';
import { PAYER_PORT, startPayer } from './payer.mjs';
import { PAYMOB, flowParams, prepareLab, seedLab } from './suite.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const SWEEP_DIR = join(E2E_DIR, 'flows', 'sweep');
const OUTPUT_ROOT = join(E2E_DIR, 'ui-sweep-output');

/**
 * The two phones. Small is the 360×640 dp floor the layout rules name; large
 * is a Galaxy S25 at its default display size (1080×2400 at 450 dpi, so
 * 384 dp wide — narrower than a Pixel's 411).
 */
const SCREENS = {
  small: { size: '720x1280', density: '320', label: 'Small 360×640dp' },
  large: { size: '1080x2400', density: '450', label: 'S25 1080×2400' },
};

/** The app caps OS text scaling at 1.3× (MAX_FONT_SCALE), so 1.3 is the worst case. */
const FONT_SCALES = ['1.0', '1.3'];

const NAV_OVERLAYS = {
  '3btn': 'com.android.internal.systemui.navbar.threebutton',
  gesture: 'com.android.internal.systemui.navbar.gestural',
};

const CELLS = Object.entries(SCREENS).flatMap(([screen, screenSpec]) =>
  FONT_SCALES.flatMap((font) =>
    Object.keys(NAV_OVERLAYS).map((nav) => ({
      id: `${screen}-${font}-${nav}`,
      screen: screenSpec,
      font,
      nav,
      label: `${screenSpec.label} · font ${font} · ${nav === '3btn' ? '3-button' : 'gesture'}`,
    })),
  ),
);

function parseArgs(argv) {
  const args = { cells: null, flows: null, ai: false, into: null };
  for (const arg of withoutPaymobFlag(argv)) {
    if (arg === '--ai') args.ai = true;
    else if (arg.startsWith('--cells=')) args.cells = arg.slice('--cells='.length).split(',');
    else if (arg.startsWith('--flows=')) args.flows = arg.slice('--flows='.length).split(',');
    else if (arg.startsWith('--into=')) args.into = arg.slice('--into='.length);
    else fail(`Unknown argument "${arg}". See the header of e2e/ui-sweep.mjs.`);
  }
  return args;
}

function pick(all, requested, key, what) {
  if (!requested) return all;
  // Each name is a prefix and may match several (`--cells=small-1.3` is both
  // nav modes); keep the matrix's own order and drop repeats.
  const picked = new Set();
  for (const name of requested) {
    const matches = all.filter((item) => key(item).startsWith(name));
    if (matches.length === 0) fail(`No ${what} matches "${name}". Available: ${all.map(key).join(', ')}`);
    matches.forEach((item) => picked.add(item));
  }
  return all.filter((item) => picked.has(item));
}

function adbShell(adb, device, ...command) {
  const result = spawnSync(adb, ['-s', device, 'shell', ...command], { encoding: 'utf8' });
  return result.stdout?.trim() ?? '';
}

/**
 * What this run changes on the device, as it was before — so it can be put
 * back. The navigation overlay is whichever navbar overlay is enabled (`[x]`).
 */
function readDeviceState(adb, device) {
  const enabledNav = adbShell(adb, device, 'cmd', 'overlay', 'list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('[x]') && line.includes('systemui.navbar.'));
  return {
    fontScale: adbShell(adb, device, 'settings', 'get', 'system', 'font_scale'),
    showImeWithHardKeyboard: adbShell(adb, device, 'settings', 'get', 'secure', 'show_ime_with_hard_keyboard'),
    navOverlay: enabledNav ? enabledNav.replace(/^\[x\]\s*/, '') : null,
  };
}

/** What to type when the device was left in a matrix cell's state. */
const MANUAL_RESET =
  'adb shell wm size reset; adb shell wm density reset; ' +
  'adb shell settings put system font_scale 1.0; ' +
  'adb shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural';

/** True while a `wm size` override is in place — the mark of a cell still applied. */
function hasSizeOverride(adb, device) {
  return adbShell(adb, device, 'wm', 'size').includes('Override size');
}

function setNavOverlay(adb, device, overlay) {
  adbShell(adb, device, 'cmd', 'overlay', 'enable-exclusive', '--category', overlay);
}

function applyCell(adb, device, cell) {
  console.log(`\n[sweep] ══ cell ${cell.id} — ${cell.label} ══`);
  adbShell(adb, device, 'wm', 'size', cell.screen.size);
  adbShell(adb, device, 'wm', 'density', cell.screen.density);
  adbShell(adb, device, 'settings', 'put', 'system', 'font_scale', cell.font);
  setNavOverlay(adb, device, NAV_OVERLAYS[cell.nav]);
  // SystemUI redraws its bar after an overlay switch; let it settle before
  // the first launch, or the first shots catch the old bar mid-swap.
  spawnSync('sleep', ['5']);
}

function restoreDevice(adb, device, before) {
  console.log('\n[sweep] restoring the device…');
  adbShell(adb, device, 'wm', 'size', 'reset');
  adbShell(adb, device, 'wm', 'density', 'reset');
  adbShell(adb, device, 'settings', 'put', 'system', 'font_scale', before.fontScale === 'null' ? '1.0' : before.fontScale);
  if (before.showImeWithHardKeyboard === 'null') {
    adbShell(adb, device, 'settings', 'delete', 'secure', 'show_ime_with_hard_keyboard');
  } else {
    adbShell(adb, device, 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', before.showImeWithHardKeyboard);
  }
  if (before.navOverlay) setNavOverlay(adb, device, before.navOverlay);
  // s13 turns airplane mode on; its onFlowComplete turns it off, but not if
  // Maestro itself was killed.
  adbShell(adb, device, 'cmd', 'connectivity', 'airplane-mode', 'disable');
  // A device that dropped off adb mid-run (the emulator died) keeps the last
  // cell's size, density, font and nav mode across a reboot.
  if (hasSizeOverride(adb, device) || !adbShell(adb, device, 'wm', 'size')) {
    console.log(`\n[sweep] ⚠ could not restore the device. When it is back, run:\n  ${MANUAL_RESET}`);
  }
}

/** The screen as it was when a flow gave up, so the sheet shows where. */
function captureFailure(adb, device, file) {
  const result = spawnSync(adb, ['-s', device, 'exec-out', 'screencap', '-p'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status === 0 && result.stdout?.length) writeFileSync(file, result.stdout);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/**
 * Maestro only writes a takeScreenshot under its own test output folder
 * (`<dir>/<timestamp>/<flow>/takeScreenshot/`), so each flow runs with a scratch
 * one and its shots are moved into the cell's folder afterwards.
 */
function collectShots(scratchDir, cellDir) {
  let entries = [];
  try {
    entries = readdirSync(scratchDir, { recursive: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (String(entry).endsWith('.png') && String(entry).includes(`takeScreenshot/`)) {
      renameSync(join(scratchDir, entry), join(cellDir, String(entry).split('/').pop()));
    }
  }
  rmSync(scratchDir, { recursive: true, force: true });
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * One row per screen, one column per cell. A screen missing from a cell is
 * marked with the flow that failed to reach it, and each failed flow gets a
 * row of its own holding the screen it stopped on.
 */
function writeContactSheet(runDir, cells, results) {
  const shots = new Map();
  for (const cell of cells) {
    let files = [];
    try {
      files = readdirSync(join(runDir, cell.id)).filter((name) => name.endsWith('.png'));
    } catch {
      // Cell not reached yet.
    }
    for (const file of files) {
      const name = file.replace(/\.png$/, '');
      if (!shots.has(name)) shots.set(name, new Set());
      shots.get(name).add(cell.id);
    }
  }
  const names = [...shots.keys()].sort();

  const failedFlow = (cellId, name) => {
    const flow = name.split('-')[0];
    const result = results.find((r) => r.cell === cellId && r.flow.startsWith(flow));
    if (!result) return 'not run';
    return result.passed ? 'not reached' : 'flow failed';
  };

  const header = cells.map((cell) => `<th>${escapeHtml(cell.label)}</th>`).join('');
  const rows = names
    .map((name) => {
      const isFailure = name.endsWith('FAILED');
      const cellsHtml = cells
        .map((cell) => {
          if (!shots.get(name).has(cell.id)) {
            return isFailure ? '<td></td>' : `<td class="missing">${failedFlow(cell.id, name)}</td>`;
          }
          const src = `${cell.id}/${name}.png`;
          return `<td><a href="${src}" target="_blank"><img loading="lazy" src="${src}" alt="${escapeHtml(name)} — ${escapeHtml(cell.label)}"></a></td>`;
        })
        .join('');
      return `<tr${isFailure ? ' class="failure"' : ''}><th class="name">${escapeHtml(name)}</th>${cellsHtml}</tr>`;
    })
    .join('\n');

  const failures = results.filter((r) => !r.passed);
  const summary =
    `${names.filter((n) => !n.endsWith('FAILED')).length} screens · ${cells.length} cells · ` +
    `${results.length - failures.length}/${results.length} flow runs completed` +
    (failures.length ? ` · failed: ${failures.map((f) => `${f.flow} @ ${f.cell}`).join(', ')}` : '');

  writeFileSync(
    join(runDir, 'index.html'),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI sweep</title>
<style>
  :root { --bg: #fdfaf8; --fg: #2b2522; --muted: #8a7f78; --line: #e8e0da; --bad: #b3261e; --badbg: #fbe9e7; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1b1817; --fg: #eee7e2; --muted: #a59a93; --line: #3a3330; --bad: #ffb4ab; --badbg: #3b1d1a; } }
  body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: var(--muted); }
  .wrap { overflow: auto; max-height: calc(100vh - 90px); }
  table { border-collapse: separate; border-spacing: 0; }
  th, td { border-bottom: 1px solid var(--line); padding: 6px; vertical-align: top; }
  thead th { position: sticky; top: 0; background: var(--bg); z-index: 2; font-size: 12px; text-align: left; min-width: 180px; }
  th.name { position: sticky; left: 0; background: var(--bg); z-index: 1; text-align: left; font: 12px ui-monospace, monospace; white-space: nowrap; }
  img { width: 180px; display: block; border: 1px solid var(--line); border-radius: 6px; }
  td.missing { color: var(--muted); font-size: 12px; text-align: center; }
  tr.failure th.name { color: var(--bad); }
  tr.failure td img { border-color: var(--bad); }
</style></head>
<body>
<h1>UI sweep — ${escapeHtml(runDir.split('/').pop())}</h1>
<p>${escapeHtml(summary)}</p>
<div class="wrap"><table>
<thead><tr><th class="name">screen</th>${header}</tr></thead>
<tbody>
${rows}
</tbody></table></div>
</body></html>
`,
  );
  writeFileSync(join(runDir, 'results.json'), JSON.stringify(results, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cells = pick(CELLS, args.cells, (cell) => cell.id, 'cell');
  const flows = pick(
    readdirSync(SWEEP_DIR).filter((name) => /^s\d+.*\.yaml$/.test(name)).sort(),
    args.flows,
    (name) => name,
    'sweep flow',
  );

  const { maestro, adb, device } = await prepareLab();
  // A size override at the start means an earlier run never got to restore
  // the device — reading its state now would "restore" to that cell's.
  if (hasSizeOverride(adb, device)) {
    fail(`The device still has a matrix cell applied (wm size override). Reset it first:\n  ${MANUAL_RESET}`);
  }
  const before = readDeviceState(adb, device);
  console.log(`[sweep] device ${device}, Paymob ${PAYMOB.mode}, was ${JSON.stringify(before)}`);

  // The AVD reports a hardware keyboard, which hides the soft one — and the
  // keyboard-open shots are half the point.
  adbShell(adb, device, 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1');

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    restoreDevice(adb, device, before);
  };
  // Ctrl+C also reaches the running maestro, which ends its spawnSync; the
  // yield after each flow is what lets this handler run before the next one.
  process.on('SIGINT', () => {
    restore();
    process.exit(130);
  });
  const yieldToSignals = () => new Promise((resolve) => setImmediate(resolve));

  // --into re-runs some cells/flows into an earlier run's folder, replacing
  // their shots and results, so one contact sheet covers the whole matrix.
  const runDir = join(OUTPUT_ROOT, args.into ?? timestamp());
  if (args.into && !existsSync(runDir)) fail(`No earlier run at ${runDir}.`);
  mkdirSync(runDir, { recursive: true });
  console.log(`[sweep] writing to ${runDir}`);

  const stopPayer = await startPayer({ checkoutOrigin: PAYMOB.checkoutOrigin }).catch((err) => {
    restore();
    fail(`Could not start the checkout payer on :${PAYER_PORT}: ${err.message}`);
  });

  const results = args.into && existsSync(join(runDir, 'results.json'))
    ? JSON.parse(readFileSync(join(runDir, 'results.json'), 'utf8'))
    : [];
  const sheetCells = CELLS.filter((cell) => cells.includes(cell) || results.some((r) => r.cell === cell.id));
  try {
    for (const cell of cells) {
      const cellDir = join(runDir, cell.id);
      mkdirSync(cellDir, { recursive: true });
      applyCell(adb, device, cell);
      for (const flow of flows) {
        console.log(`\n[sweep] ── ${cell.id} / ${flow} ──`);
        const started = Date.now();
        const prefix = `${flow.split('-')[0]}-`;
        for (const old of readdirSync(cellDir).filter((name) => name.startsWith(prefix))) {
          rmSync(join(cellDir, old));
        }
        seedLab();
        const scratchDir = join(runDir, '.maestro');
        const passed = runMaestro(
          maestro,
          join(SWEEP_DIR, flow),
          { ...flowParams(), AI: String(args.ai) },
          [`--test-output-dir=${scratchDir}`],
        );
        collectShots(scratchDir, cellDir);
        if (!passed) captureFailure(adb, device, join(cellDir, `${flow.split('-')[0]}-zz-FAILED.png`));
        const previous = results.findIndex((r) => r.cell === cell.id && r.flow === flow);
        if (previous !== -1) results.splice(previous, 1);
        results.push({ cell: cell.id, flow, passed, seconds: Math.round((Date.now() - started) / 1000) });
        writeContactSheet(runDir, sheetCells, results);
        await yieldToSignals();
      }
    }
  } finally {
    await stopPayer();
    restore();
    writeContactSheet(runDir, sheetCells, results);
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n[sweep] ${results.length - failed.length}/${results.length} flow runs completed.`);
  if (failed.length) console.log(`[sweep] incomplete: ${failed.map((f) => `${f.flow} @ ${f.cell}`).join(', ')}`);
  console.log(`[sweep] contact sheet: ${join(runDir, 'index.html')}`);
}

await main();
