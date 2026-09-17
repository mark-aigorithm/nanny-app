type SwitchProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Read out by assistive tech and shown beside the track. */
  label: string;
};

/** A modern on/off pill toggle, styled from theme tokens (`.switch` in global.css). */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}
