import { useId } from 'react';

import { Select, type SelectOption } from './select';

type FilterSelectProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Labelled dropdown filter shown above a table. The shared replacement for the
 * old rows of pill buttons — scales cleanly as more filters are added.
 */
export function FilterSelect({ label, value, options, onChange, disabled }: FilterSelectProps) {
  const id = useId();
  return (
    <div className="filter-select">
      <label className="filter-select-label" htmlFor={id}>
        {label}
      </label>
      <Select id={id} value={value} options={options} disabled={disabled} onChange={onChange} />
    </div>
  );
}
