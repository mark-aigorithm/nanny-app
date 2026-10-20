import { useId } from 'react';

export type SegmentedOption<V extends string> = { value: V; label: string };

type SegmentedControlProps<V extends string> = {
  /** Names the group for everyone; shown above the track unless `hideLegend`. */
  legend: string;
  /** A card title already says what this is: keep the legend for screen readers only. */
  hideLegend?: boolean;
  value: V;
  options: readonly SegmentedOption<V>[];
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Id of a hint describing the current choice. */
  describedBy?: string;
  /** Lets an error summary link to (and focus) the group. */
  id?: string;
};

/**
 * A small set of mutually exclusive choices shown as one pill track (In-app /
 * Push / Both). Built on native radios, so it is one Tab stop that lands on the
 * chosen option, and the arrow keys move and choose — no custom key handling.
 * The radio itself is visually hidden; the focus ring is drawn on its label.
 */
export function SegmentedControl<V extends string>({
  legend,
  hideLegend = false,
  value,
  options,
  onChange,
  disabled = false,
  describedBy,
  id,
}: SegmentedControlProps<V>) {
  const name = useId();
  return (
    <fieldset
      className="segmented"
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      <legend className={hideLegend ? 'sr-only' : 'segmented-legend'}>{legend}</legend>
      <div className="segmented-track">
        {options.map((option) => {
          const on = option.value === value;
          return (
            <label key={option.value} className={`segmented-option${on ? ' segmented-option--on' : ''}`}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={on}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
