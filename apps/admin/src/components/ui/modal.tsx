import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ICON_SIZE, X } from './icon';

type ModalProps = {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'sm' | 'lg';
  /**
   * False ignores a click on the backdrop, for a dialog holding real work (a
   * selection across pages). Escape and the Close button still call `onClose`,
   * so the consumer can ask before throwing the work away.
   */
  dismissible?: boolean;
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root: Element | null | undefined): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden], [inert]'));
}

/**
 * Open dialogs, oldest first. Only the last one — the dialog on top, such as a
 * ConfirmDialog over a form — answers Escape and Tab.
 */
const openModals: symbol[] = [];
const isTop = (token: symbol) => openModals[openModals.length - 1] === token;

/**
 * Reusable modal dialog: backdrop, close button, Escape-to-close, and
 * click-outside-to-close. Generalizes the old bespoke ID-document viewer.
 *
 * Focus is managed the way a modal must be: it moves into the dialog on open
 * (an `autoFocus` field wins; else the body's first control, the footer's,
 * then Close), Tab and Shift+Tab wrap inside it, and closing hands focus back
 * to whatever opened it. Dialogs stack, and only the top one handles keys.
 *
 * Children render inside a padded `.modal-body`, so a consumer passes its
 * content bare — no wrapper needed for the gutters.
 */
export function Modal({ title, onClose, children, footer, size = 'md', dismissible = true }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read while rendering, before an autoFocus child can move focus: the trigger.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  // The latest onClose without re-registering (which would reorder the stack).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const token = Symbol('modal');
    openModals.push(token);
    const dialog = dialogRef.current;

    if (dialog && !dialog.contains(document.activeElement)) {
      const first =
        focusables(dialog.querySelector('.modal-body'))[0] ??
        focusables(dialog.querySelector('.modal-footer'))[0] ??
        focusables(dialog)[0];
      first?.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isTop(token) || !dialog) return;
      if (event.key === 'Escape') {
        // An open dropdown inside the dialog claimed this Escape to close itself.
        if (event.defaultPrevented) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const active = document.activeElement;
      // A dropdown's popover is portaled outside the dialog; it owns its own keys.
      if (active instanceof Element && !dialog.contains(active) && active.closest('[role="listbox"], [role="menu"]')) {
        return;
      }
      const items = focusables(dialog);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = openModals.indexOf(token);
      if (index !== -1) openModals.splice(index, 1);
      // Hand focus back, unless something else has deliberately taken it.
      const active = document.activeElement;
      const focusLeftWithUs = !active || active === document.body || (dialog?.contains(active) ?? false);
      if (focusLeftWithUs && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={dismissible ? () => onCloseRef.current() : undefined}
    >
      <div
        ref={dialogRef}
        className={`modal${size === 'md' ? '' : ` modal--${size}`}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn icon-btn--plain"
            aria-label="Close"
            onClick={() => onCloseRef.current()}
          >
            <X size={ICON_SIZE.inline} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
