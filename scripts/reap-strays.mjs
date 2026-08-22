#!/usr/bin/env node
/**
 * Reaps stray processes that the test environment and dev servers leave behind.
 *
 * Why this exists: on Windows, killing a process does NOT kill its children —
 * there are no POSIX process groups. `pnpm test:env` runs the Firebase emulator
 * and the Paymob fake in the foreground under `concurrently`, whose
 * `--kill-others` only fires when concurrently itself gets to run its handler.
 * Close the terminal, end a Claude session, or delete a worktree and both
 * servers are orphaned — holding their ports and their memory until reboot.
 * Started three times without a teardown, you get three Paymob servers.
 *
 * Two modes, because there are two different questions to ask:
 *
 *   --ports        Free the ports `pnpm test:env` owns. Precise by construction:
 *                  whatever holds 4010 either IS the Paymob fake or is squatting
 *                  on the port the fake needs, and both end the same way. Safe to
 *                  run before every start, which is what makes it self-healing —
 *                  strays cannot accumulate across runs.
 *
 *   --under <dir>  Kill node processes whose command line points inside <dir>.
 *                  Used by the Claude Code SessionEnd hook, where the interesting
 *                  scope is "this worktree", not "this port": it catches the Vite
 *                  dev servers and Playwright runners too. Path scoping is what
 *                  keeps a worktree session from killing the main checkout's
 *                  dev server.
 *
 * Add --dry-run to either mode to list what would be killed and exit without
 * killing it. Worth doing once after changing the port table.
 *
 * No dependencies — this has to run when node_modules is in any state.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';
const DRY_RUN = process.argv.includes('--dry-run');
/** Verb for the per-process log line, so a dry run never claims it killed anything. */
const VERB = DRY_RUN ? 'would reap' : 'reaped';

/**
 * Ports owned by `pnpm test:env`. The Firebase ports come from firebase.json
 * (auth) plus firebase-tools' own hub/logging defaults, which are started
 * alongside the emulator and orphan with it.
 */
const TEST_ENV_PORTS = [
  { port: 9099, what: 'Firebase auth emulator' },
  { port: 4400, what: 'Firebase emulator hub' },
  { port: 4500, what: 'Firebase emulator logging' },
  { port: 4010, what: 'Paymob fake server' },
];

/** Runs a command and returns stdout, or '' if it fails or does not exist. */
function capture(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function powershell(script) {
  return capture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

/**
 * PIDs listening on a TCP port.
 *
 * Windows uses Get-NetTCPConnection rather than parsing `netstat`, whose state
 * column ("LISTENING") is localised and would silently match nothing on a
 * non-English Windows.
 */
function pidsOnPort(port) {
  const out = IS_WINDOWS
    ? powershell(
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |` +
          ' Select-Object -ExpandProperty OwningProcess',
      )
    : capture('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);

  return [...new Set(out.split(/\s+/).filter(Boolean).map(Number))].filter(
    (pid) => Number.isInteger(pid) && pid > 0,
  );
}

/** Every running node process, with its parent and full command line. */
function nodeProcesses() {
  if (IS_WINDOWS) {
    const json = powershell(
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" |' +
        ' Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
    );
    if (!json.trim()) return [];
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      return [];
    }
    // ConvertTo-Json emits a bare object, not an array, for a single match.
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((r) => ({
      pid: r.ProcessId,
      ppid: r.ParentProcessId,
      cmd: r.CommandLine ?? '',
    }));
  }

  return capture('ps', ['-eo', 'pid=,ppid=,args='])
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m) => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }))
    .filter((p) => /\bnode(\.exe)?\b/.test(p.cmd));
}

/**
 * Kills a process AND its descendants. The tree matters: the Firebase emulator
 * is a node process that spawns Java, and killing only the node half leaves the
 * JVM holding port 9099.
 */
function killTree(pid) {
  if (DRY_RUN) return;
  if (IS_WINDOWS) {
    capture('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL'); // process group, if it leads one
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/**
 * This process and its ancestors, which must never be reaped: the hook invokes
 * us as `node .../reap-strays.mjs --under <dir>`, so our own command line
 * matches the very pattern we are searching for.
 */
function protectedPids(processes) {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const safe = new Set([process.pid, process.ppid]);
  let cursor = byPid.get(process.pid);
  while (cursor && !safe.has(cursor.ppid)) {
    safe.add(cursor.ppid);
    cursor = byPid.get(cursor.ppid);
  }
  return safe;
}

/**
 * Reduces a set of doomed pids to the roots of their process chains, then kills
 * each root's whole tree.
 *
 * Walking UP matters as much as killTree walking down. The live chain is
 * `pnpm test:env` -> concurrently -> `pnpm test:emulator` -> firebase, and only
 * the middle links carry the project path on their command line — a pnpm shim's
 * argv is just `pnpm.cjs test:env`. Kill the match alone and the wrappers above
 * it survive as orphans, which is how six idle pnpm processes accumulated here.
 * The walk stops at any non-node parent, so it can never climb out into the
 * terminal or the editor that started the run.
 */
function killRoots(pids, processes) {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const safe = protectedPids(processes);

  const roots = new Set();
  for (const pid of pids) {
    if (safe.has(pid)) continue;
    let cursor = byPid.get(pid);
    let root = pid;
    while (cursor && byPid.has(cursor.ppid) && !safe.has(cursor.ppid)) {
      cursor = byPid.get(cursor.ppid);
      root = cursor.pid;
    }
    roots.add(root);
  }

  for (const pid of roots) {
    const proc = byPid.get(pid);
    console.log(`  ${VERB} tree at pid ${pid}${proc ? ` — ${proc.cmd.slice(0, 90)}` : ''}`);
    killTree(pid);
  }
  return roots.size;
}

function reapPorts() {
  const processes = nodeProcesses();
  const doomed = new Set();

  for (const { port, what } of TEST_ENV_PORTS) {
    for (const pid of pidsOnPort(port)) {
      if (pid === process.pid) continue;
      console.log(`  found pid ${pid} holding :${port} — ${what}`);
      doomed.add(pid);
    }
  }

  return killRoots(doomed, processes);
}

/**
 * Does `haystack` reference something at or below the directory `path`?
 *
 * A plain substring test is wrong: the scope `.../worktrees/alpha` would then
 * also match `.../worktrees/alpha-two`, so ending the `alpha` session would
 * kill a live sibling worktree. The same flaw would let the main scope
 * `D:\Projects\nanny-app` match a neighbouring `D:\Projects\nanny-app-legacy`.
 * So the match must end on a path boundary — a separator, a closing quote,
 * whitespace, or end of string.
 *
 * Both separator spellings are tried because a Windows command line may mix them.
 */
function pathMatches(haystack, path) {
  const BOUNDARIES = ['\\', '/', '"', "'", ' ', undefined];
  for (const needle of [path, path.replace(/\\/g, '/')]) {
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
      if (BOUNDARIES.includes(haystack[at + needle.length])) return true;
    }
  }
  return false;
}

function reapUnder(dir) {
  const target = resolve(dir);
  const needle = IS_WINDOWS ? target.toLowerCase() : target;
  const processes = nodeProcesses();
  const safe = protectedPids(processes);

  /**
   * Worktrees live INSIDE the main checkout (.claude/worktrees/<name>), so a
   * main-repo session ending would otherwise reap every sibling worktree —
   * killing the dev servers of Claude sessions that are still running. A
   * worktree session's own scope already points inside .claude/worktrees, and
   * must keep reaping itself, so only the main-repo scope excludes them.
   */
  const worktrees = `${needle}${IS_WINDOWS ? '\\' : '/'}.claude${IS_WINDOWS ? '\\' : '/'}worktrees`;
  const scopeIsWorktree = needle.includes(IS_WINDOWS ? '.claude\\worktrees' : '.claude/worktrees');

  const doomed = new Set();
  for (const proc of processes) {
    if (safe.has(proc.pid)) continue;
    const haystack = IS_WINDOWS ? proc.cmd.toLowerCase() : proc.cmd;
    if (!pathMatches(haystack, needle)) continue;
    if (!scopeIsWorktree && pathMatches(haystack, worktrees)) {
      console.log(`  skipped pid ${proc.pid} — belongs to a worktree session`);
      continue;
    }
    console.log(`  found pid ${proc.pid} — ${proc.cmd.slice(0, 100)}`);
    doomed.add(proc.pid);
  }

  return killRoots(doomed, processes);
}

const args = process.argv.slice(2);
const underIndex = args.indexOf('--under');
const scope = underIndex !== -1 ? args[underIndex + 1] : null;

if (underIndex !== -1 && (!scope || scope.startsWith('--'))) {
  console.error('reap-strays: --under requires a directory');
  process.exit(2);
}

const label = scope ? `scanning under ${resolve(scope)}` : 'freeing test-env ports';
console.log(`reap-strays: ${label}${DRY_RUN ? ' (dry run)' : ''}`);

const count = scope ? reapUnder(scope) : reapPorts();
console.log(count === 0 ? '  nothing to reap' : `  ${VERB} ${count} process tree(s) (roots)`);
