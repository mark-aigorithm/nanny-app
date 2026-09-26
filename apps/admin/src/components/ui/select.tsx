import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Check, ChevronDown, ICON_SIZE } from './icon';
import { useAnchoredPopover } from './use-anchored-popover';

export type SelectOption<V extends string | number = string> = { value: V; label: string };

type SelectProps<V extends string | number = string> = {
  value: V;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  /** Compact variant for use inside table rows. */
  compact?: boolean;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  id?: string;
  'aria-label'?: string;
};

/**
 * Modern custom dropdown (button trigger + listbox popover) — replaces the
 * native <select> so it matches the app's menus. Closes on outside click,
 * Escape, or selection. Like Menu, the listbox is portaled and anchored, so a
 * table's scroll wrapper or a modal body can't clip it.
 */
export function Select<V extends string | number = string>({
  value,
  options,
  onChange,
  compact,
  disabled,
  placeholder = 'Select…',
  title,
  id,
  'aria-label': ariaLabel,
}: SelectProps<V>) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  useAnchoredPopover({ open, triggerRef, popoverRef, placement: 'bottom-start', width: 'min' });

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
    <div className="dropdown">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={`dropdown-trigger${compact ? ' dropdown-trigger--compact' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="dropdown-value">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={compact ? 14 : ICON_SIZE.inline} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={`dropdown-popover${compact ? ' dropdown-popover--compact' : ''}`}
            role="listbox"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`dropdown-option${isSelected ? ' dropdown-option--selected' : ''}`}
                  onClick={() => {
                    if (option.value !== value) onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check size={14} aria-hidden />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
