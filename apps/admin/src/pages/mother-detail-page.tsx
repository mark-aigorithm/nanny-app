import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import {
  Badge,
  Card,
  DescriptionList,
  type DescriptionItem,
  DetailHeader,
  ErrorState,
  LoadingState,
} from '@admin/components/ui';
import { fetchMother } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const DASH = <span className="table-empty">—</span>;

export function MotherDetailPage() {
  const { id = '' } = useParams();
  const { data: mother, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['mother', id],
    queryFn: () => fetchMother(id),
    enabled: id !== '',
  });

  const profile: DescriptionItem[] = mother
    ? [
        { label: 'Name', value: mother.name },
        { label: 'Email', value: mother.email },
        { label: 'Phone', value: mother.phone ?? DASH },
        { label: 'Location', value: mother.location ?? DASH },
        {
          label: 'Account',
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
        { label: 'Bookings placed', value: mother.bookingCount },
        { label: 'Registered', value: formatDate(mother.createdAt) },
        { label: 'User ID', value: <code>{mother.id}</code> },
      ]
    : [];

  return (
    <section>
      <DetailHeader
        backTo="/users"
        backLabel="Back to users"
        title={mother ? mother.name : 'Mommy details'}
        subtitle="Parent account — read only."
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
        <Card title="Profile">
          <DescriptionList items={profile} />
        </Card>
      )}
    </section>
  );
}
