import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, StaleRefreshBanner, TableSkeleton } from '@admin/components/ui';
import { PromoCodeForm } from '@admin/features/promo-codes/promo-code-form';
import { PromoCodeTable } from '@admin/features/promo-codes/promo-code-table';
import { fetchPromoCodes } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function PromoCodesPage() {
  const canManage = useCanManage('promoCodes');
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
      {canManage && <PromoCodeForm />}
      {isLoading && <TableSkeleton columns={8} />}
      {error != null && !promoCodes && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {promoCodes && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <PromoCodeTable promoCodes={promoCodes} />
        </>
      )}
    </section>
  );
}
