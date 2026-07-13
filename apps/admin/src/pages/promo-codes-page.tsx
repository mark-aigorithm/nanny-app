import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, TableSkeleton } from '@admin/components/ui';
import { PromoCodeForm } from '@admin/features/promo-codes/promo-code-form';
import { PromoCodeTable } from '@admin/features/promo-codes/promo-code-table';
import { fetchPromoCodes } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function PromoCodesPage() {
  const { data: promoCodes, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: fetchPromoCodes,
  });

  return (
    <section>
      <PageHeader
        title="Promo Codes"
        subtitle="Create discount codes and control how often they can be redeemed."
      />
      <PromoCodeForm />
      {isLoading && <TableSkeleton columns={8} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {promoCodes && <PromoCodeTable promoCodes={promoCodes} />}
    </section>
  );
}
