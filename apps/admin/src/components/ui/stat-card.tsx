import type { ReactNode } from 'react';

import { Skeleton } from './skeleton';

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  iconTone?: 'primary' | 'gold' | 'bronze';
  hint?: string;
  loading?: boolean;
};

/** KPI tile for the dashboard reporting row. */
export function StatCard({ label, value, icon, iconTone = 'primary', hint, loading }: StatCardProps) {
  const iconClass = `stat-card-icon${iconTone !== 'primary' ? ` stat-card-icon--${iconTone}` : ''}`;
  return (
    <div className="stat-card">
      {icon && <span className={iconClass}>{icon}</span>}
      <div className="stat-card-body">
        {loading ? (
          <Skeleton width={72} height={26} radius={6} />
        ) : (
          <div className="stat-card-value">{value}</div>
        )}
        <div className="stat-card-label">{label}</div>
        {hint && !loading && <div className="stat-card-hint">{hint}</div>}
      </div>
    </div>
  );
}
