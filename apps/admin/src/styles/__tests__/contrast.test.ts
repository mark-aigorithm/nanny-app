import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest runs from apps/admin. (jsdom gives `import.meta.url` an http URL, and `?raw` CSS is stubbed.)
const css = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');

/** A `:root` token's hex value, e.g. token('--color-warning') → '#b8860b'. */
function token(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`${name} is not a 6-digit hex token in global.css`);
  return match[1];
}

/** The `var(--…)` a rule gives `property`, e.g. ruleVar('.badge--warning', 'color'). */
function ruleVar(selector: string, property: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  const value = block && new RegExp(`(?:^|[;\\s])${property}:\\s*var\\((--[\\w-]+)\\)`).exec(block)?.[1];
  if (!value) throw new Error(`${selector} has no ${property}: var(--…)`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('colour contrast (WCAG AA, 4.5:1 for normal-size text)', () => {
  it.each(['.badge', '.badge--success', '.badge--danger', '.badge--warning'])(
    '%s text is readable on its own fill',
    (selector) => {
      const text = token(ruleVar(selector, 'color'));
      const fill = token(ruleVar(selector, 'background'));
      expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['--color-surface', '--color-background', '--color-surface-muted', '--color-warm-subtle'])(
    'muted meta text is readable on %s',
    (surface) => {
      expect(contrast(token('--color-text-muted'), token(surface))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('the near-limit character counter is readable on a card', () => {
    expect(contrast(token(ruleVar('.char-counter--warn', 'color')), token('--color-surface'))).toBeGreaterThanOrEqual(4.5);
  });
});
