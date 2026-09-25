import { Router, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';

import { config } from '@backend/lib/config';
import {
  readResetPasswordAsset,
  renderResetPasswordPage,
  type ResetPasswordAsset,
} from '@backend/pages/reset-password';

/**
 * GET /auth/action — the page the password-reset email links to, set as the
 * project's custom action URL in the Firebase console. Public by design: the
 * one-time code in the link is the only credential, and the page spends it
 * against Firebase directly.
 */
export const resetPasswordPageRouter = Router();

/**
 * Where Identity Toolkit lives for this backend. Under the Auth emulator the
 * page must talk to the emulator, or a test's reset code would be unknown to
 * it. The one `process.env` read, as in lib/firebase.ts: the flag is set by
 * test tooling only and isn't part of the validated config.
 */
function identityToolkit(): { base: string; origin: string } {
  const emulatorHost = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  if (emulatorHost) {
    return {
      base: `http://${emulatorHost}/identitytoolkit.googleapis.com`,
      origin: `http://${emulatorHost}`,
    };
  }
  return {
    base: 'https://identitytoolkit.googleapis.com',
    origin: 'https://identitytoolkit.googleapis.com',
  };
}

/**
 * Replaces the app-wide API policy for this page. The link carries a live
 * one-time code, so the page must neither send it on as a referrer nor be
 * cached, framed, or allowed to reach anywhere but Identity Toolkit.
 */
function pageHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ['data:'],
      connectSrc: [identityToolkit().origin],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  })(req, res, next);
}

resetPasswordPageRouter.get('/', pageHeaders, (_req: Request, res: Response) => {
  res.type('html').send(
    renderResetPasswordPage({
      identityToolkitBase: identityToolkit().base,
      fallbackHandler: `https://${config.firebase.projectId}.firebaseapp.com/__/auth/action`,
    }),
  );
});

const ASSET_TYPES: Record<ResetPasswordAsset, string> = {
  'app.js': 'application/javascript',
  'app.css': 'text/css',
};

for (const asset of Object.keys(ASSET_TYPES) as ResetPasswordAsset[]) {
  resetPasswordPageRouter.get(`/${asset}`, (_req: Request, res: Response) => {
    res.type(ASSET_TYPES[asset]).send(readResetPasswordAsset(asset));
  });
}
