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

  // Edge-to-edge Android doesn't shrink the window for the keyboard, so an
  // iOS-only `behavior` left comment boxes and form fields under it. (The care
  // log's sheet sets its own `behavior` for both platforms.)
  it('avoids the keyboard only through the shared KeyboardAvoidingView', () => {
    expect(
      offenders(
        (src, file) =>
          !file.endsWith(path.join('components', 'ui', 'keyboard-avoiding-view.tsx')) &&
          !file.endsWith(path.join('nanny', 'CareLogScreen.tsx')) &&
          /import \{[^}]*\bKeyboardAvoidingView\b[^}]*\} from 'react-native'/.test(src),
      ),
    ).toEqual([]);
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

  // Sage `colors.primary` is 2.49:1 on the cream page, so text in it (links,
  // "Mark all read", totals) failed 4.5:1. Text takes `colors.primaryDark`.
  // The "NannyNow" wordmarks keep the brand sage: logotypes are exempt.
  it('never colours text with the sage primary', () => {
    const wordmarks = [
      path.join('components', 'ParentTabHeader.tsx'),
      path.join('auth', 'styles', 'sign-in-screen.styles.ts'),
      path.join('auth', 'styles', 'upload-id-screen.styles.ts'),
      path.join('auth', 'styles', 'verify-email-screen.styles.ts'),
    ];
    const sageText = /(^|[^A-Za-z])color: colors\.primary\b(?![A-Za-z])/m;
    expect(
      offenders((src, file) => !wordmarks.some((w) => file.endsWith(w)) && sageText.test(src)),
    ).toEqual([]);
  });
});
