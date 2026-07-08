import type { ReactNode } from 'react';

type CardProps = {
  title?: string;
  /** Removes padding — for tables and other edge-to-edge content. */
  flush?: boolean;
  children: ReactNode;
};

export function Card({ title, flush = false, children }: CardProps) {
  return (
    <div className={flush ? 'card card--flush' : 'card'}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}
