import type { ReactNode } from 'react';

type BadgeProps = {
  tone?: 'neutral' | 'success';
  children: ReactNode;
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={tone === 'success' ? 'badge badge--success' : 'badge'}>
      {children}
    </span>
  );
}
