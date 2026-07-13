import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ICON_SIZE, X } from './icon';

type ModalProps = {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'sm';
};

/**
 * Reusable modal dialog: backdrop, close button, Escape-to-close, and
 * click-outside-to-close. Generalizes the old bespoke ID-document viewer.
 */
export function Modal({ title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal${size === 'sm' ? ' modal--sm' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="icon-btn icon-btn--plain" aria-label="Close" onClick={onClose}>
            <X size={ICON_SIZE.inline} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
