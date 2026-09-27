import type { ReactNode } from 'react';

type CardProps = {
  title?: string;
  /** A control pinned to the title's trailing edge (e.g. an Edit button). */
  action?: ReactNode;
  /** Removes padding — for tables and other edge-to-edge content. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
};

export function Card({ title, action, flush = false, className, children }: CardProps) {
  const classes = ['card', flush ? 'card--flush' : null, className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {title &&
        (action ? (
          <div className="card-header">
            <h3>{title}</h3>
            {action}
          </div>
        ) : (
          <h3>{title}</h3>
        ))}
      {children}
    </div>
  );
}
