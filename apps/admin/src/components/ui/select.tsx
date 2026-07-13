import { useEffect, useRef, useState } from 'react';

import { Check, ChevronDown, ICON_SIZE } from './icon';

export type SelectOption = { value: string; label: string };

type SelectProps = {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
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
 * Escape, or selection.
 */
export function Select({
  value,
  options,
  onChange,
  compact,
  disabled,
  placeholder = 'Select…',
  title,
  id,
  'aria-label': ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

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
    <div className="dropdown" ref={rootRef}>
      <button
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
      {open && (
        <div className="dropdown-popover" role="listbox">
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
        </div>
      )}
    </div>
  );
}
