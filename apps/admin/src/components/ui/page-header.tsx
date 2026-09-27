import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  /**
   * The page's primary action, pinned to the header's right — on a table page,
   * the "Add …" button that opens the create modal. Render it only when the
   * viewer can manage the section.
   */
  action?: ReactNode;
};

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className={`page-header${action ? ' page-header--with-action' : ''}`}>
      <div className="page-header-text">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}
