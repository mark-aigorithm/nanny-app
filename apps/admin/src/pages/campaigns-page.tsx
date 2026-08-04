import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, StaleRefreshBanner, TableSkeleton } from '@admin/components/ui';
import { CampaignForm } from '@admin/features/campaigns/campaign-form';
import { CampaignTable } from '@admin/features/campaigns/campaign-table';
import { fetchCampaigns } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function CampaignsPage() {
  const { data: campaigns, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  return (
    <section>
      <PageHeader
        title="Campaigns"
        subtitle="Promotional cards shown as a carousel on the parent Home screen."
      />
      <CampaignForm />
      {isLoading && <TableSkeleton columns={8} />}
      {error != null && !campaigns && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {campaigns && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <CampaignTable campaigns={campaigns} />
        </>
      )}
    </section>
  );
}
