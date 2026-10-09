/**
 * A small HTTP service that lets scripts/advance.js pay a checkout.
 *
 * advance.js runs in Maestro's JS sandbox, which can make HTTP calls and
 * nothing else. When a flow's *other* actor has to pay (the mother in C4,
 * while the device is signed in as the nanny), the payment still has to go
 * through a real checkout page, so that Paymob or the fake delivers the webhook
 * as it does in production. run.mjs starts this for the length of a run. It
 * drives that page in headless Chromium through the same driver the admin
 * suite uses, so it works the same whatever PAYMOB_MODE is.
 *
 *   POST /pay   { publicKey, clientSecret, card? } → { success, returnUrl }
 *   GET  /wait?ms=500                              → 204 after that long
 *
 * `/wait` exists because the sandbox has no sleep. Paymob races its webhook
 * against the redirect, so a step that needs the payment *recorded* polls the
 * backend, and it waits between polls here rather than hammering it.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { checkoutContext, payCheckout } from '../../../test-support/paymob/checkout-driver.mjs';

export const PAYER_PORT = 4020;

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

/** Serves the routes above; resolves once it is listening. */
async function serve(checkoutOrigin) {
  let browser = null;

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${PAYER_PORT}`);
      try {
        if (req.method === 'GET' && url.pathname === '/wait') {
          const ms = Math.min(Number(url.searchParams.get('ms') ?? 500), 10_000);
          await new Promise((resolve) => setTimeout(resolve, ms));
          send(res, 204);
          return;
        }
        if (req.method === 'POST' && url.pathname === '/pay') {
          const { publicKey, clientSecret, card } = await readJson(req);
          // Launched on first use: most runs never pay off-device.
          browser ??= await chromium.launch();
          const context = await checkoutContext(browser);
          try {
            const page = await context.newPage();
            send(res, 200, await payCheckout(page, { origin: checkoutOrigin, publicKey, clientSecret, card }));
          } finally {
            await context.close();
          }
          return;
        }
        send(res, 404, { error: `No route ${req.method} ${url.pathname}` });
      } catch (err) {
        send(res, 500, { error: String(err?.stack ?? err) });
      }
    })();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PAYER_PORT, '127.0.0.1', resolve);
  });

  process.on('SIGTERM', () => {
    void browser?.close().finally(() => process.exit(0));
    if (!browser) process.exit(0);
  });
}

/**
 * Starts the payer as a child process and resolves once it is listening, to a
 * function that stops it. It exits with the parent too, since its stdin is the
 * parent's pipe.
 */
export function startPayer({ checkoutOrigin }) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), checkoutOrigin], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  return new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`the payer exited with ${code} before it was ready`)));
    child.stdout.on('data', (chunk) => {
      if (!chunk.toString().includes('listening')) return;
      child.removeAllListeners('exit');
      resolve(
        () =>
          new Promise((done) => {
            child.once('exit', done);
            child.kill('SIGTERM');
          }),
      );
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const checkoutOrigin = process.argv[2];
  if (!checkoutOrigin) {
    console.error('Usage: node e2e/payer.mjs <checkout origin>');
    process.exit(1);
  }
  // An orphan would hold the port into the next run; leave when the parent goes.
  process.stdin.on('end', () => process.exit(0));
  process.stdin.resume();
  await serve(checkoutOrigin);
  console.log(`[payer] listening on :${PAYER_PORT}, paying through ${checkoutOrigin}`);
}
