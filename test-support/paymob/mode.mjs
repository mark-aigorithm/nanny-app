/**
 * Which Paymob the E2E suites pay through: Paymob's real TEST-mode sandbox, or
 * the local fake.
 *
 * The flows are the same in both modes (see checkout.json). Only where things
 * live changes, and this file is the one place that says where:
 *
 *   PAYMOB_MODE=sandbox   (default) Paymob's real checkout and the backend on
 *                         :3002 (`start:test:paymob-sandbox`, which takes TEST
 *                         keys from apps/backend/.env.paymob-sandbox.local and
 *                         needs `pnpm paymob:tunnel` for the webhook).
 *   PAYMOB_MODE=fake      The fake on :4010 and the backend on :3001
 *                         (`start:test`, .env.test). For working offline, or
 *                         without test keys.
 *
 * The sandbox backend has its own port so that a run in one mode can never
 * talk to a backend started in the other. Each runner checks the port its
 * mode names, so a backend in the wrong mode simply isn't found.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Labels and test cards; see the comment at the top of checkout.json. */
export const CHECKOUT = JSON.parse(readFileSync(join(HERE, 'checkout.json'), 'utf8'));

export const PAYMOB_PROFILES = {
  fake: {
    mode: 'fake',
    /** Where the backend under test listens, from the host. */
    backendUrl: 'http://127.0.0.1:3001',
    /** The checkout origin, from the host (Playwright, the payer). */
    checkoutOrigin: 'http://127.0.0.1:4010',
    /** What the emulator's app is given; 10.0.2.2 is the host from inside the VM. */
    emulatorApiBaseUrl: 'http://10.0.2.2:3001',
    emulatorCheckoutOrigin: 'http://10.0.2.2:4010',
    backendScript: 'pnpm --filter @nanny-app/backend start:test',
    metroScript: 'pnpm --filter @nanny-app/mobile e2e:metro:paymob-fake',
  },
  sandbox: {
    mode: 'sandbox',
    backendUrl: 'http://127.0.0.1:3002',
    checkoutOrigin: 'https://accept.paymob.com',
    emulatorApiBaseUrl: 'http://10.0.2.2:3002',
    // Empty: the app falls back to Paymob's own host (lib/paymobCheckout.ts).
    emulatorCheckoutOrigin: '',
    backendScript: 'pnpm --filter @nanny-app/backend start:test:paymob-sandbox',
    metroScript: 'pnpm --filter @nanny-app/mobile e2e:metro',
  },
};

/**
 * The mode a run asked for: `--paymob=<mode>` on the command line wins over
 * `PAYMOB_MODE`, and the default is the sandbox. An unknown value throws
 * rather than falling back. A typo that silently ran against the fake would
 * report a sandbox pass that never happened.
 */
export function resolvePaymobMode(argv = process.argv.slice(2), env = process.env) {
  const flag = argv.find((arg) => arg.startsWith('--paymob='));
  const raw = (flag ? flag.slice('--paymob='.length) : env['PAYMOB_MODE'] ?? 'sandbox').trim();
  const profile = PAYMOB_PROFILES[raw];
  if (!profile) {
    throw new Error(
      `Unknown Paymob mode "${raw}". Use --paymob=sandbox or --paymob=fake (or PAYMOB_MODE).`,
    );
  }
  return profile;
}

/** argv without the `--paymob=` flag, so runners can keep treating the rest as flow names. */
export function withoutPaymobFlag(argv) {
  return argv.filter((arg) => !arg.startsWith('--paymob='));
}

/** The URL the mobile app opens: must stay in step with apps/mobile/src/lib/paymobCheckout.ts. */
export function checkoutUrl(origin, publicKey, clientSecret) {
  const params = new URLSearchParams({ publicKey, clientSecret });
  return `${origin.replace(/\/$/, '')}/unifiedcheckout/?${params.toString()}`;
}
