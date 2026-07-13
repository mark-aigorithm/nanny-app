import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft, ICON_SIZE } from './icon';

type DetailHeaderProps = {
  title: string;
  subtitle?: string;
  /** Route the back button navigates to. Defaults to the previous history entry. */
  backTo?: string;
  /** Accessible label for the back button. */
  backLabel?: string;
  /** Optional actions (e.g. Approve/Reject buttons) shown at the trailing edge. */
  actions?: ReactNode;
};

/**
 * Header for a record detail page: a back button, the page title/subtitle, and
 * an optional actions slot. Mirrors <PageHeader> styling so detail pages read as
 * native to the console.
 */
export function DetailHeader({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  actions,
}: DetailHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="detail-header">
      <button
        type="button"
        className="detail-back"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
      >
        <ArrowLeft size={ICON_SIZE.inline} aria-hidden />
        {backLabel}
      </button>
      <div className="detail-header-row">
        <div className="detail-header-titles">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="detail-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
