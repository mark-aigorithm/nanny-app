import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

const MenuContext = createContext<{ close: () => void } | null>(null);

type MenuProps = {
  /** Content rendered inside the trigger button (icon and/or text). */
  trigger: ReactNode;
  /** Accessible label for the trigger (required — the trigger is often icon-only). */
  triggerLabel: string;
  triggerClassName?: string;
  /** Extra class on the root wrapper (e.g. for full-width triggers). */
  className?: string;
  placement?: Placement;
  children: ReactNode;
};

/**
 * Headless dropdown menu: a trigger button and a popover of items.
 * Closes on outside click, Escape, or after an item is selected.
 */
export function Menu({
  trigger,
  triggerLabel,
  triggerClassName = 'icon-btn',
  className,
  placement = 'bottom-end',
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
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
    <div className={['menu', className].filter(Boolean).join(' ')} ref={rootRef}>
      <button
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu-popover menu-popover--${placement}`} role="menu">
          <MenuContext.Provider value={{ close: () => setOpen(false) }}>
            {children}
          </MenuContext.Provider>
        </div>
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
