type SpinnerProps = {
  size?: number;
  'aria-label'?: string;
};

/** Indeterminate loading spinner. */
export function Spinner({ size = 20, 'aria-label': ariaLabel = 'Loading' }: SpinnerProps) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label={ariaLabel}
      style={{ width: size, height: size }}
    />
  );
}
