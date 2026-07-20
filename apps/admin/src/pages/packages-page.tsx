import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, TableSkeleton } from '@admin/components/ui';
import { PackageForm } from '@admin/features/packages/package-form';
import { PackageTable } from '@admin/features/packages/package-table';
import { fetchPackages } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function PackagesPage() {
  const { data: packages, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['packages'],
    queryFn: fetchPackages,
  });

  return (
    <section>
      <PageHeader
        title="Packages"
        subtitle="Curate the purchasable hour bundles offered to parents (e.g. 50 hours for 2000 EGP)."
      />
      <PackageForm />
      {isLoading && <TableSkeleton columns={6} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {packages && <PackageTable packages={packages} />}
    </section>
  );
}
