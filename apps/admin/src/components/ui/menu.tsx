import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useAnchoredPopover, type PopoverPlacement } from './use-anchored-popover';

const MenuContext = createContext<{ close: () => void } | null>(null);

type MenuProps = {
  /** Content rendered inside the trigger button (icon and/or text). */
  trigger: ReactNode;
  /** Accessible label for the trigger (required — the trigger is often icon-only). */
  triggerLabel: string;
  triggerClassName?: string;
  /** Extra class on the root wrapper (e.g. for full-width triggers). */
  className?: string;
  placement?: PopoverPlacement;
  /** Match the popover width to the trigger (for full-width triggers). */
  matchTriggerWidth?: boolean;
  children: ReactNode;
};

/**
 * Headless dropdown menu: a trigger button and a popover of items.
 * The popover is portaled to the body and anchored with `position: fixed`, so
 * it's never clipped by an ancestor's overflow (tables, flush cards), and it
 * flips above the trigger when there's no room below (a table's last row).
 * Closes on outside click, Escape, or after an item is selected.
 */
export function Menu({
  trigger,
  triggerLabel,
  triggerClassName = 'icon-btn',
  className,
  placement = 'bottom-end',
  matchTriggerWidth = false,
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useAnchoredPopover({
    open,
    triggerRef,
    popoverRef,
    placement,
    width: matchTriggerWidth ? 'match' : 'auto',
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={['menu', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div ref={popoverRef} className="menu-popover" role="menu">
            <MenuContext.Provider value={{ close: () => setOpen(false) }}>
              {children}
            </MenuContext.Provider>
          </div>,
          document.body,
        )}
    </div>
  );
}

type MenuItemProps = {
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

export function MenuItem({ children, icon, danger, disabled, onSelect }: MenuItemProps) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item${danger ? ' menu-item--danger' : ''}`}
      disabled={disabled}
      onClick={() => {
        onSelect?.();
        ctx?.close();
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-separator" role="separator" />;
}
