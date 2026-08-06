import fs from 'node:fs';
import path from 'node:path';

import Handlebars from 'handlebars';
import type { EmailTemplate, ReceiptEmailVars } from '@nanny-app/shared';

/**
 * Renders named email templates to `{ subject, html }`. Templates are in-repo
 * HTML files under ./templates: `layout.html` is the shared chrome (header +
 * footer, matching the mobile app's design tokens) with a `{{{body}}}` slot,
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

interface TemplateDef {
  subject: (vars: ReceiptEmailVars) => string;
  bodyFile: string;
}

const TEMPLATES: Record<EmailTemplate, TemplateDef> = {
  RECEIPT: {
    subject: (v) => `Your NannyApp receipt — booking #${v.bookingId}`,
    bodyFile: 'receipt.html',
  },
};

export interface RenderedEmail {
  subject: string;
  html: string;
}

/**
 * Render a template with its variables. Today only `RECEIPT` exists, so `vars`
 * is `ReceiptEmailVars`; adding a template means adding an entry to `TEMPLATES`
 * and widening this signature.
 */
export function renderEmail(template: EmailTemplate, vars: ReceiptEmailVars): RenderedEmail {
  registerHelpers();
  const def = TEMPLATES[template];
  const body = loadTemplate(def.bodyFile)(vars);
  const html = loadTemplate('layout.html')({ ...vars, body });
  return { subject: def.subject(vars), html };
}
