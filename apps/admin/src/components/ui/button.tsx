import type { ComponentPropsWithRef } from 'react';

// With ref, so a caller can move focus to a button (React 19 passes ref as a prop).
type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}
