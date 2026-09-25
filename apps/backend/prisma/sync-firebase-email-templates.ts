/**
 * Pushes the in-repo password-reset email (src/lib/email/templates/
 * password-reset.html) to the Firebase project's Authentication → Templates.
 * Firebase takes no template per request, so this is how a template change
 * reaches users — run it after merging one. No app build is needed.
 *
 * Dry-run unless --apply is passed: it always writes a browser preview and
 * reads the live template, and writes only with --apply.
 *
 *   pnpm email:sync-firebase
 *   pnpm email:sync-firebase --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import admin from 'firebase-admin';

import { config } from '../src/lib/config';
import '../src/lib/firebase';
import {
  buildResetPasswordTemplate,
  getResetPasswordTemplate,
  pushResetPasswordTemplate,
  type FirebaseEmailTemplateConfig,
} from '../src/lib/email/firebase-templates';

const apply = process.argv.includes('--apply');

function summarise(t: FirebaseEmailTemplateConfig | undefined): Record<string, unknown> {
  return {
    senderDisplayName: t?.senderDisplayName ?? '(none)',
    subject: t?.subject ?? '(default)',
    bodyFormat: t?.bodyFormat ?? '(default)',
    bodyLength: t?.body?.length ?? 0,
    customized: t?.customized ?? false,
  };
}

async function main(): Promise<void> {
  // The one process.env read: lib/firebase.ts reads it directly too, and it
  // isn't part of the validated config.
  if (process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
    throw new Error(
      'FIREBASE_AUTH_EMULATOR_HOST is set — the emulator ignores email templates and runs without real credentials. Unset it to target a real project.',
    );
  }

  const projectId = config.firebase.projectId;
  const next = buildResetPasswordTemplate();

  const previewPath = path.join(__dirname, '..', 'dist', 'firebase-templates', 'password-reset.html');
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, next.body);

  // eslint-disable-next-line no-console
  console.log(`Firebase project: ${projectId}\nPreview: ${previewPath}`);

  const credential = admin.app().options.credential;
  if (!credential) throw new Error('Firebase Admin initialised without a credential.');
  const { access_token: accessToken } = await credential.getAccessToken();

  const current = await getResetPasswordTemplate({ projectId, accessToken });
  // eslint-disable-next-line no-console
  console.log('Current:', summarise(current), '\nNew:    ', summarise(next));

  if (!apply) {
    // eslint-disable-next-line no-console
    console.log('\nDRY RUN — nothing written. Pass --apply to push.');
    return;
  }

  const saved = await pushResetPasswordTemplate({ projectId, accessToken });
  // eslint-disable-next-line no-console
  console.log('\nAPPLIED:', summarise(saved));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
