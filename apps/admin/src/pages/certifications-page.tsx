import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, TableSkeleton } from '@admin/components/ui';
import { CertificationForm } from '@admin/features/certifications/certification-form';
import { CertificationTable } from '@admin/features/certifications/certification-table';
import { fetchCertifications } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function CertificationsPage() {
  const { data: certifications, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['certifications'],
    queryFn: fetchCertifications,
  });

  return (
    <section>
      <PageHeader
        title="Certifications"
        subtitle="Curate the credentials nannies can add to their profile (e.g. CPR, First Aid). Nannies pick from the active list themselves."
      />
      <CertificationForm />
      {isLoading && <TableSkeleton columns={4} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {certifications && <CertificationTable certifications={certifications} />}
    </section>
  );
}
