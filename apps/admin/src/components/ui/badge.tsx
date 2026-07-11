import type { ReactNode } from 'react';

type BadgeProps = {
  tone?: 'neutral' | 'success' | 'danger';
  children: ReactNode;
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={tone === 'neutral' ? 'badge' : `badge badge--${tone}`}>
      {children}
    </span>
  );
}
