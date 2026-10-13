#!/usr/bin/env node
/**
 * Runs the Maestro flows against a local Android emulator.
 *
 * Maestro drives the app; everything the app cannot do to itself — creating the
 * accounts, advancing the nanny's or the admin's side of a flow — happens over
 * the same HTTP the other suites use. This script is the seam between the two.
 *
 * It deliberately does *not* start the emulator, Metro or the backend. Those
 * are long-running processes a person wants in their own terminal, with their
 * own logs; a runner that owned them would hide the output that explains most
 * failures. Instead it checks each one is there and says exactly which command
 * is missing — see e2e/README.md.
 *
 *   node e2e/run.mjs            # every flow in e2e/flows
 *   node e2e/run.mjs smoke      # just e2e/flows/smoke.yaml
 *   node e2e/run.mjs --paymob=fake a01
 *                               # paying through the local Paymob fake
 *                               # instead of Paymob's real TEST-mode
 *                               # sandbox (or set PAYMOB_MODE=fake)
 *
 * The flows are the same in both Paymob modes. Each pays by typing a test card
 * into whichever checkout page Metro points the app at; see
 * test-support/paymob/mode.mjs for what the flag changes.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withoutPaymobFlag } from '../../../test-support/paymob/mode.mjs';

import { fail } from './android.mjs';
import { runMaestro } from './lab.mjs';
import { PAYER_PORT, startPayer } from './payer.mjs';
import { PAYMOB, flowParams, prepareLab, seedLab } from './suite.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const FLOWS_DIR = join(E2E_DIR, 'flows');

function flowsToRun(requested) {
  const available = readdirSync(FLOWS_DIR)
    // `_`-prefixed files are shared subflows (see flows/_launch.yaml), not tests.
    .filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
    .sort();

  if (requested.length === 0) return available;

  return requested.map((name) => {
    const file = name.endsWith('.yaml') ? name : `${name}.yaml`;
    // Flows are named for the catalogue (a01-…), so a prefix is enough to pick one.
    const match = available.find((candidate) => candidate === file || candidate.startsWith(name));
    if (!match) fail(`No flow matches "${name}". Available: ${available.join(', ')}`);
    return match;
  });
}

function runFlow(maestro, flow) {
  console.log(`\n[e2e] ── ${flow} ─────────────────────────────`);
  return runMaestro(maestro, join(FLOWS_DIR, flow), flowParams());
}

async function main() {
  const { maestro, device } = await prepareLab();

  console.log(`[e2e] device ${device}, maestro ${maestro}, Paymob ${PAYMOB.mode}`);

  const flows = flowsToRun(withoutPaymobFlag(process.argv.slice(2)));
  const stopPayer = await startPayer({ checkoutOrigin: PAYMOB.checkoutOrigin }).catch((err) =>
    fail(`Could not start the checkout payer on :${PAYER_PORT}: ${err.message}`),
  );
  // Re-seeded before every flow, not once per run. Each flow books the same
  // nanny for the next few hours, and the second one to try would be refused
  // for double-booking her — so without this the suite would only pass in the
  // order it happened to be written in. Seeding undoes the previous flow as
  // well as the previous run, which is also what makes a single flow runnable
  // on its own.
  const failed = flows.filter((flow) => {
    seedLab();
    return !runFlow(maestro, flow);
  });
  await stopPayer();

  console.log(`\n[e2e] ${flows.length - failed.length}/${flows.length} flows passed.`);
  if (failed.length > 0) {
    console.error(`[e2e] failed: ${failed.join(', ')}`);
    process.exit(1);
  }
}

await main();
