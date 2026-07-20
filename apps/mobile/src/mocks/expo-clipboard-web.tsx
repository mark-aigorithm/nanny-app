/**
 * Minimal web stub for expo-clipboard used during Vite preview builds.
 * The real package ships JSX inside .js (ClipboardPasteButton), which the
 * preview bundler does not transform — same reason the other expo packages
 * here are stubbed.
 */
export async function setStringAsync(text: string): Promise<boolean> {
  console.log('[preview] Clipboard.setStringAsync', text);
  return true;
}

export async function getStringAsync(): Promise<string> {
  return '';
}
