import type { ReactNode } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CalendarClock,
  CircleAlert,
  ClipboardList,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Skeleton,
  StatCard,
  Ticket,
  UserPlus,
  Users,
  Wallet,
} from '@admin/components/ui';
import { useDashboardStats, type StatusSlice } from '@admin/features/dashboard/use-dashboard-stats';
import { apiErrorMessage } from '@admin/lib/api-error';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-6)',
  'var(--chart-5)',
];

function formatEgp(value: number): string {
  return `${Math.round(value).toLocaleString()} EGP`;
}

export function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching } = useDashboardStats();
  const { stats } = data;

  return (
    <section>
      <PageHeader title="Dashboard" subtitle="A snapshot of bookings, nannies, and revenue." />

      {error != null && (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} retrying={isFetching} />
      )}

      <div className="stat-grid">
        <StatCard
          label="Total bookings"
          value={stats.totalBookings}
          loading={isLoading}
          icon={<ClipboardList size={ICON_SIZE.stat} />}
        />
        <StatCard
          label="Awaiting approval"
          value={stats.pendingApprovals}
          hint="Bookings + nanny reviews"
          loading={isLoading}
          iconTone="gold"
          icon={<CircleAlert size={ICON_SIZE.stat} />}
        />
        <StatCard
          label="Revenue (completed)"
          value={formatEgp(stats.grossRevenue)}
          loading={isLoading}
          iconTone="gold"
          icon={<Wallet size={ICON_SIZE.stat} />}
        />
        <StatCard
          label="Active nannies"
          value={stats.activeNannies}
          loading={isLoading}
          icon={<Users size={ICON_SIZE.stat} />}
        />
        <StatCard
          label="Nannies to review"
          value={stats.pendingNannies}
          loading={isLoading}
          icon={<UserPlus size={ICON_SIZE.stat} />}
        />
        <StatCard
          label="Active promo codes"
          value={stats.activePromoCodes}
          loading={isLoading}
          iconTone="bronze"
          icon={<Ticket size={ICON_SIZE.stat} />}
        />
      </div>

      <div className="chart-grid">
        <ChartCard
          title="Bookings over time"
          subtitle="New requests, last 14 days"
          icon={<CalendarClock size={ICON_SIZE.inline} />}
          loading={isLoading}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data.bookingsOverTime}
              margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
            >
              <CartesianGrid stroke="var(--color-warm-subtle)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                name="Bookings"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <DonutCard
          title="Bookings by status"
          subtitle="All bookings"
          loading={isLoading}
          slices={data.bookingsByStatus}
        />

        <DonutCard
          title="Nanny approvals"
          subtitle="Registration pipeline"
          loading={isLoading}
          slices={data.nannyBreakdown}
        />
      </div>
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  loading,
  children,
}: {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="chart-card">
      <p className="chart-card-title">
        {icon} {title}
      </p>
      <p className="chart-card-subtitle">{subtitle}</p>
      <div className="chart-body">{loading ? <Skeleton height="100%" radius={12} /> : children}</div>
    </div>
  );
}

function DonutCard({
  title,
  subtitle,
  loading,
  slices,
}: {
  title: string;
  subtitle: string;
  loading?: boolean;
  slices: StatusSlice[];
}) {
  return (
    <div className="chart-card">
      <p className="chart-card-title">{title}</p>
      <p className="chart-card-subtitle">{subtitle}</p>
      <div className="chart-body">
        {loading ? (
          <Skeleton height="100%" radius={12} />
        ) : slices.length === 0 ? (
          <p className="empty-state">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="count"
                nameKey="label"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                stroke="var(--color-surface)"
              >
                {slices.map((slice, index) => (
                  <Cell key={slice.key} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      {!loading && slices.length > 0 && (
        <div className="chart-legend">
          {slices.map((slice, index) => (
            <span className="chart-legend-item" key={slice.key}>
              <span
                className="chart-legend-swatch"
                style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
              />
              {slice.label} ({slice.count})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
