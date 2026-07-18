import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  Badge,
  Button,
  CalendarClock,
  Card,
  ClipboardList,
  DescriptionList,
  type DescriptionItem,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  Pencil,
  StatCard,
} from '@admin/components/ui';
import { MotherEditForm } from '@admin/features/users/mother-edit-form';
import { fetchMother } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const DASH = <span className="table-empty">—</span>;

export function MotherDetailPage() {
  const { id = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const { data: mother, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['mother', id],
    queryFn: () => fetchMother(id),
    enabled: id !== '',
  });

  const contact: DescriptionItem[] = mother
    ? [
        { label: 'Email', value: mother.email },
        { label: 'Phone', value: mother.phone ?? DASH },
        { label: 'Address', value: mother.location ?? DASH, wide: true },
      ]
    : [];

  const account: DescriptionItem[] = mother
    ? [
        {
          label: 'Status',
          value: (
            <Badge tone={mother.isActive ? 'success' : 'danger'}>
              {mother.isActive ? 'active' : 'deactivated'}
            </Badge>
          ),
        },
        {
          label: 'Verification',
          value:
            [mother.isEmailVerified ? 'email' : null, mother.isPhoneVerified ? 'phone' : null]
              .filter(Boolean)
              .join(' & ') || 'none',
        },
      ]
    : [];

  return (
    <section>
      <DetailHeader
        backTo="/users"
        backLabel="Back to users"
        title={mother ? mother.name : 'Mommy details'}
        subtitle="Parent account"
        actions={
          mother && (
            <>
              <Badge tone={mother.isActive ? 'success' : 'danger'}>
                {mother.isActive ? 'active' : 'deactivated'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil size={ICON_SIZE.inline} aria-hidden />
                Edit
              </Button>
            </>
          )
        }
      />

      {isLoading && <LoadingState label="Loading account…" />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {mother && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Bookings placed"
              value={mother.bookingCount}
              icon={<ClipboardList size={ICON_SIZE.stat} aria-hidden />}
            />
            <StatCard
              label="Registered"
              value={formatDate(mother.createdAt)}
              icon={<CalendarClock size={ICON_SIZE.stat} aria-hidden />}
              iconTone="gold"
            />
          </div>

          <Card title="Contact">
            <DescriptionList items={contact} />
          </Card>

          <Card title="Account">
            <DescriptionList items={account} />
          </Card>
        </>
      )}

      {editing && mother && (
        <MotherEditForm mother={mother} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}
