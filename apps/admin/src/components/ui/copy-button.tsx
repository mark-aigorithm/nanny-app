import { useEffect, useRef, useState } from 'react';

import { Check, Copy, ICON_SIZE } from './icon';
import { useToast } from './toast';

type CopyButtonProps = {
  /** The text put on the clipboard. */
  value: string;
  /** What it is, for the button's name and the toast — e.g. "Email", "Phone number". */
  label: string;
};

/**
 * A small icon button that copies `value`. The icon turns into a check for a
 * moment and a toast confirms; if the browser refuses clipboard access, the
 * toast says so instead of failing silently.
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(reset.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(reset.current);
      reset.current = setTimeout(() => setCopied(false), 1500);
      toast.success(`${label} copied`, value);
    } catch {
      toast.error(
        `Couldn’t copy the ${label.toLowerCase()}`,
        'The browser blocked clipboard access — select the text and copy it instead.',
      );
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      className="icon-btn icon-btn--plain copy-btn"
      aria-label={`Copy ${label.toLowerCase()}`}
      title={`Copy ${label.toLowerCase()}`}
      onClick={() => void copy()}
    >
      <Icon size={ICON_SIZE.menu} aria-hidden />
    </button>
  );
}
