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
import { PromoCodeFormModal } from '@admin/features/promo-codes/promo-code-form';
import { PromoCodeTable } from '@admin/features/promo-codes/promo-code-table';
import { fetchPromoCodes } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function PromoCodesPage() {
  const canManage = useCanManage('promoCodes');
  const [adding, setAdding] = useState(false);
  const {
    data: promoCodes,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: fetchPromoCodes,
  });

  return (
    <section>
      <PageHeader
        title="Promo Codes"
        subtitle="Create discount codes and control how often they can be redeemed."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add promo code
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={10} />}
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
      {adding && <PromoCodeFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
