import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { CertificationFormModal } from '@admin/features/certifications/certification-form';
import { CertificationTable } from '@admin/features/certifications/certification-table';
import { fetchCertifications } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function CertificationsPage() {
  const canManage = useCanManage('certifications');
  const [adding, setAdding] = useState(false);
  const {
    data: certifications,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['certifications'],
    queryFn: fetchCertifications,
  });

  return (
    <section>
      <PageHeader
        title="Certifications"
        subtitle="Curate the credentials nannies can add to their profile (e.g. CPR, First Aid). Nannies pick from the active list themselves."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add certification
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={4} />}
      {error != null && !certifications && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {certifications && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <CertificationTable certifications={certifications} />
        </>
      )}
      {adding && <CertificationFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
