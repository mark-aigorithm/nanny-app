#!/usr/bin/env node
/**
 * Opens a public https tunnel to the Paymob-sandbox backend (:3002), so that
 * Paymob's servers can deliver the payment webhook to this machine.
 *
 *   pnpm paymob:tunnel
 *
 * It uses a cloudflared "quick tunnel", which needs no account and gives a
 * fresh *.trycloudflare.com URL each time it starts. That URL is written to
 * apps/backend/.paymob-sandbox-tunnel (gitignored). `start:test:paymob-sandbox`
 * reads the file at start-up and puts the URL on every intention as
 * `notification_url` and `redirection_url`. Nothing needs setting in the Paymob
 * dashboard: the intention's own URLs are the ones Paymob calls.
 *
 * Start this first and leave it running. If it restarts, the URL changes, so
 * restart the backend too. Ctrl+C closes the tunnel and removes the file, so a
 * stale URL is never picked up.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TUNNEL_FILE = join(REPO_ROOT, 'apps', 'backend', '.paymob-sandbox-tunnel');
/** The sandbox backend's port; test-support/paymob/mode.mjs names the same one. */
const TARGET = 'http://127.0.0.1:3002';

function resolveCloudflared() {
  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], {
    encoding: 'utf8',
  });
  if (onPath.status === 0) return onPath.stdout.split(/\r?\n/)[0].trim();

  const local = join(homedir(), '.local', 'bin', 'cloudflared');
  if (existsSync(local)) return local;

  console.error(
    '[paymob-tunnel] cloudflared is not installed. On Linux (amd64):\n' +
      '  mkdir -p ~/.local/bin && curl -fsSL -o ~/.local/bin/cloudflared \\\n' +
      '    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \\\n' +
      '    && chmod +x ~/.local/bin/cloudflared\n' +
      'Other platforms: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  );
  process.exit(1);
}

const tunnel = spawn(resolveCloudflared(), ['tunnel', '--no-autoupdate', '--url', TARGET], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let announced = false;
function scan(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);
  const match = !announced && text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match) return;
  announced = true;
  writeFileSync(TUNNEL_FILE, `${match[0]}\n`);
  console.log(
    `\n[paymob-tunnel] ${match[0]} → ${TARGET}\n` +
      '[paymob-tunnel] Written to apps/backend/.paymob-sandbox-tunnel. Now start (or restart):\n' +
      '  pnpm --filter @nanny-app/backend start:test:paymob-sandbox\n',
  );
}
tunnel.stdout.on('data', scan);
tunnel.stderr.on('data', scan);

function cleanUp() {
  rmSync(TUNNEL_FILE, { force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    tunnel.kill(signal);
    cleanUp();
    process.exit(0);
  });
}
tunnel.on('exit', (code) => {
  cleanUp();
  process.exit(code ?? 1);
});
