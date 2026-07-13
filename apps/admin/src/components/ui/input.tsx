import type { InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Standalone styled text input (same look as inputs inside <Field>). */
export function Input({ className, ...rest }: InputProps) {
  return <input className={['input', className].filter(Boolean).join(' ')} {...rest} />;
}
