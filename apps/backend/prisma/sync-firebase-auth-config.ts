/**
 * Pushes the Auth settings we keep in the repo to the Firebase project:
 *
 *   - the password-reset email (src/lib/email/templates/password-reset.html)
 *     → Authentication → Templates. Firebase takes no template per request.
 *   - the password policy (src/lib/password-policy.ts), so Firebase's hosted
 *     reset page refuses passwords the app would.
 *
 * Run it after merging a change to either. No app build is needed.
 *
 * Dry-run unless --apply is passed: it always writes a browser preview of the
 * email and reads the live settings, and writes only with --apply.
 *
 *   pnpm firebase:sync-auth-config
 *   pnpm firebase:sync-auth-config --apply
 */
import fs from 'node:fs';
import path from 'node:path';

import admin from 'firebase-admin';

import { config } from '../src/lib/config';
import { firebaseAuth } from '../src/lib/firebase';
import {
  buildResetPasswordTemplate,
  getResetPasswordTemplate,
  pushResetPasswordTemplate,
  type FirebaseEmailTemplateConfig,
} from '../src/lib/email/firebase-templates';
import { PASSWORD_POLICY } from '../src/lib/password-policy';

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

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

async function main(): Promise<void> {
  // The one process.env read: lib/firebase.ts reads it directly too, and it
  // isn't part of the validated config.
  if (process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
    throw new Error(
      'FIREBASE_AUTH_EMULATOR_HOST is set — the emulator ignores these settings and runs without real credentials. Unset it to target a real project.',
    );
  }

  const projectId = config.firebase.projectId;
  const next = buildResetPasswordTemplate();

  const previewPath = path.join(__dirname, '..', 'dist', 'firebase-templates', 'password-reset.html');
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, next.body);
  log(`Firebase project: ${projectId}\nPreview: ${previewPath}`);

  const credential = admin.app().options.credential;
  if (!credential) throw new Error('Firebase Admin initialised without a credential.');
  const { access_token: accessToken } = await credential.getAccessToken();
  const projectConfig = firebaseAuth.projectConfigManager();

  const currentTemplate = await getResetPasswordTemplate({ projectId, accessToken });
  const currentPolicy = (await projectConfig.getProjectConfig()).passwordPolicyConfig;
  log('\nReset email');
  log('  current:', summarise(currentTemplate));
  log('  new:    ', summarise(next));
  log('\nPassword policy');
  log('  current:', JSON.stringify(currentPolicy ?? '(none)'));
  log('  new:    ', JSON.stringify(PASSWORD_POLICY));

  if (!apply) {
    log('\nDRY RUN — nothing written. Pass --apply to push.');
    return;
  }

  const savedTemplate = await pushResetPasswordTemplate({ projectId, accessToken });
  log('\nAPPLIED reset email:', summarise(savedTemplate));
  const saved = await projectConfig.updateProjectConfig({ passwordPolicyConfig: PASSWORD_POLICY });
  log('APPLIED password policy:', JSON.stringify(saved.passwordPolicyConfig));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
