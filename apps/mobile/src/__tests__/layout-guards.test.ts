/**
 * Source-level guards for layout rules that hold across every device. Each one
 * caught a real bug on a real phone; a check here fails the moment new code
 * reintroduces the pattern, which no single-screen test would notice.
 */
import fs from 'fs';
import path from 'path';

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' || entry.name === '__preview__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const FILES = ['src', 'app'].flatMap((dir) => sourceFiles(path.join(MOBILE_ROOT, dir)));

function offenders(test: (source: string, file: string) => boolean): string[] {
  return FILES.filter((file) => test(fs.readFileSync(file, 'utf8'), file)).map((file) =>
    path.relative(MOBILE_ROOT, file),
  );
}

describe('layout guards', () => {
  it('scans the app source', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  // React Native's own Text ignores the font-scale cap (React 19 drops
  // defaultProps), so at large OS font sizes it overflows fixed layouts.
  it('renders text only through the capped Text / TextInput', () => {
    const rawImport = /import \{[^}]*\b(Text|TextInput)\b(?! as)[^}]*\} from 'react-native'/;
    expect(
      offenders(
        (src, file) =>
          !file.endsWith(path.join('components', 'ui', 'text.tsx')) &&
          (rawImport.test(src.replace(/import type \{[^}]*\}[^;]*;/g, '')) ||
            src.includes('Animated.Text')),
      ),
    ).toEqual([]);
  });

  // The system bars' size is device- and setting-dependent (Android 3-button
  // vs gesture navigation, notch, Dynamic Island) — it must be read from the
  // safe-area insets, never guessed per platform.
  it('never guesses system-bar space with Platform.OS', () => {
    const guess =
      /\b(padding|margin)(Top|Bottom|Vertical)?\s*:\s*Platform\.OS|\b(top|bottom)\s*:\s*Platform\.OS/;
    expect(offenders((src) => guess.test(src))).toEqual([]);
  });

  it('reads the status bar height only in the theme', () => {
    expect(
      offenders(
        (src, file) =>
          src.includes('StatusBar.currentHeight') &&
          !file.endsWith(path.join('theme', 'layout.ts')),
      ),
    ).toEqual([]);
  });
});
