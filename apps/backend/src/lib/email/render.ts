import fs from 'node:fs';
import path from 'node:path';

import Handlebars from 'handlebars';
import type {
  EmailTemplate,
  EmailVerificationEmailVars,
  ReceiptEmailVars,
} from '@nanny-app/shared';

/**
 * Renders named email templates to `{ subject, html }`. Templates are in-repo
 * HTML files under ./templates: `layout.html` is the shared chrome (header +
 * a per-template footer line, matching the mobile app's design tokens) with a
 * `{{{body}}}` slot,
 * and each template has its own body file. Handlebars does the `{{variable}}`
 * substitution and `{{#if}}` for optional lines; the `formatMoney` helper turns
 * numeric amounts into display strings.
 *
 * `__dirname`-relative loading resolves to src/ under ts-jest/ts-node and to
 * dist/ from the built server (scripts/copy-assets.mjs copies the templates
 * into dist during `pnpm build`). Compiled templates are cached per process.
 */

const templatesDir = path.join(__dirname, 'templates');

let helpersRegistered = false;
function registerHelpers(): void {
  if (helpersRegistered) return;
  // "EGP 1,234.00" — mirrors the mobile formatMoney so receipts read the same
  // as the in-app amounts. Non-finite input degrades to 0 rather than "NaN".
  Handlebars.registerHelper('formatMoney', (amount: unknown, currency: unknown): string => {
    const n = Number(amount);
    const value = Number.isFinite(n) ? n : 0;
    const formatted = value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${String(currency ?? '').trim()} ${formatted}`.trim();
  });
  helpersRegistered = true;
}

const templateCache = new Map<string, Handlebars.TemplateDelegate>();
function loadTemplate(fileName: string): Handlebars.TemplateDelegate {
  const cached = templateCache.get(fileName);
  if (cached) return cached;
  const source = fs.readFileSync(path.join(templatesDir, fileName), 'utf8');
  const compiled = Handlebars.compile(source);
  templateCache.set(fileName, compiled);
  return compiled;
}

/**
 * The variables each template substitutes. Adding a template means adding a
 * line here plus an entry in `TEMPLATES` — the two are keyed by the same enum,
 * so a template with no vars type (or vice versa) fails to compile.
 */
interface TemplateVars {
  RECEIPT: ReceiptEmailVars;
  EMAIL_VERIFICATION: EmailVerificationEmailVars;
}

type TemplateDefs = {
  [K in EmailTemplate]: {
    subject: (vars: TemplateVars[K]) => string;
    bodyFile: string;
    /** The layout's footer line — each email says why it was sent. */
    footerNote: string;
  };
};

const TEMPLATES: TemplateDefs = {
  RECEIPT: {
    subject: (v) => `Your Nanny Now receipt — booking #${v.bookingId}`,
    bodyFile: 'receipt.html',
    footerNote: 'This is an automated receipt from Nanny Now. Please keep it for your records.',
  },
  EMAIL_VERIFICATION: {
    // The code is deliberately not in the subject: subject lines show up in
    // notification previews on a locked screen, which is not where a
    // one-time code belongs.
    subject: () => 'Confirm your email for Nanny Now',
    bodyFile: 'email-verification.html',
    footerNote: "You're receiving this because this address was entered in the Nanny Now app.",
  },
};

/** A body file wrapped in the shared layout. */
function renderInLayout(bodyFile: string, footerNote: string, vars: object): string {
  registerHelpers();
  const body = loadTemplate(bodyFile)(vars);
  return loadTemplate('layout.html')({ ...vars, body, footerNote });
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * Render a template with its variables. Generic over the template so the
 * `vars` argument is checked against that specific template's shape —
 * passing receipt variables to the verification template will not compile.
 */
export function renderEmail<T extends EmailTemplate>(
  template: T,
  vars: TemplateVars[T],
): RenderedEmail {
  const def = TEMPLATES[template];
  return { subject: def.subject(vars), html: renderInLayout(def.bodyFile, def.footerNote, vars) };
}
