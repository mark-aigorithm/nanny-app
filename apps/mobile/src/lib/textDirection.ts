import type { TextStyle } from 'react-native';

// Arabic (incl. supplements and presentation forms) and Hebrew.
const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[A-Za-zÀ-ɏ]/;

/**
 * Right-aligns text whose first strong letter is Arabic or Hebrew. The app's
 * layout is LTR, so a question typed in Arabic otherwise hugs the left edge
 * with a ragged right — hard to read in a language that starts on the right.
 */
export function textDirectionStyle(text: string | null | undefined): TextStyle | undefined {
  if (!text) return undefined;
  for (const char of text) {
    if (RTL_CHAR.test(char)) return { textAlign: 'right', writingDirection: 'rtl' };
    if (LTR_CHAR.test(char)) return undefined;
  }
  return undefined;
}
