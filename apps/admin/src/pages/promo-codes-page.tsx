import { useQuery } from '@tanstack/react-query';

import { Feedback, PageHeader } from '@admin/components/ui';
import { PromoCodeForm } from '@admin/features/promo-codes/promo-code-form';
import { PromoCodeTable } from '@admin/features/promo-codes/promo-code-table';
import { fetchPromoCodes } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function PromoCodesPage() {
  const { data: promoCodes, isLoading, error } = useQuery({
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
      {isLoading && <p>Loading promo codes…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {promoCodes && <PromoCodeTable promoCodes={promoCodes} />}
    </section>
  );
}
