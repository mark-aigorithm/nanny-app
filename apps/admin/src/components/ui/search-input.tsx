import { useId, useRef, type InputHTMLAttributes } from 'react';

import { ICON_SIZE, Search, X } from './icon';

type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'className'
> & {
  value: string;
  onChange: (value: string) => void;
  /** The field's accessible name ("Search mothers"); also its clear button's ("Clear search mothers"). */
  label: string;
  /** Shows `label` above the field, in the filter-bar label style. Hidden otherwise. */
  showLabel?: boolean;
  className?: string;
};

/**
 * A search field: a rounded box with a search icon, and a clear button once
 * something is typed (in place of the browser's own, which can't be styled).
 * Clearing puts the cursor back in the box.
 */
export function SearchInput({
  value,
  onChange,
  label,
  showLabel = false,
  className,
  id,
  ...rest
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  return (
    <div className={['search-input', className].filter(Boolean).join(' ')}>
      {showLabel && (
        <label className="filter-select-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="search-input-box">
        <Search size={ICON_SIZE.inline} className="search-input-icon" aria-hidden />
        <input
          ref={ref}
          id={inputId}
          type="search"
          className="search-input-field"
          aria-label={showLabel ? undefined : label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...rest}
        />
        {value && (
          <button
            type="button"
            className="search-input-clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => {
              onChange('');
              ref.current?.focus();
            }}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
