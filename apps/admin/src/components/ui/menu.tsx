import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

const MenuContext = createContext<{ close: () => void } | null>(null);

/** Gap (px) between the trigger and its popover. */
const OFFSET = 6;

/**
 * Fixed-position style for the popover, computed from the trigger's viewport
 * rect. Using `position: fixed` + a portal means no ancestor `overflow`
 * (e.g. the table's scroll container or a flush card) can clip the menu.
 */
function popoverStyle(rect: DOMRect, placement: Placement, matchWidth: boolean): CSSProperties {
  const style: CSSProperties = { position: 'fixed' };
  if (placement === 'bottom-start' || placement === 'bottom-end') {
    style.top = rect.bottom + OFFSET;
  } else {
    style.bottom = window.innerHeight - rect.top + OFFSET;
  }
  if (placement === 'bottom-start' || placement === 'top-start') {
    style.left = rect.left;
  } else {
    style.right = window.innerWidth - rect.right;
  }
  if (matchWidth) style.width = rect.width;
  return style;
}

type MenuProps = {
  /** Content rendered inside the trigger button (icon and/or text). */
  trigger: ReactNode;
  /** Accessible label for the trigger (required — the trigger is often icon-only). */
  triggerLabel: string;
  triggerClassName?: string;
  /** Extra class on the root wrapper (e.g. for full-width triggers). */
  className?: string;
  placement?: Placement;
  /** Match the popover width to the trigger (for full-width triggers). */
  matchTriggerWidth?: boolean;
  children: ReactNode;
};

/**
 * Headless dropdown menu: a trigger button and a popover of items.
 * The popover is portaled to the body and positioned with `position: fixed`,
 * so it's never clipped by an ancestor's overflow (tables, flush cards).
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
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position the popover against the trigger, and keep it aligned while open.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

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
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            className="menu-popover"
            role="menu"
            style={popoverStyle(rect, placement, matchTriggerWidth)}
          >
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
