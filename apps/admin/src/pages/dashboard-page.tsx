import { Card, PageHeader } from '@admin/components/ui';

export function DashboardPage() {
  return (
    <section>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of bookings, users, and platform activity."
      />
      <Card>
        <p className="empty-state">Metrics coming soon.</p>
      </Card>
    </section>
  );
}
