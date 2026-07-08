import type { ReactNode } from 'react';

type FieldProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

/** Labelled form control with an optional hint line. Wrap an input/select. */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
