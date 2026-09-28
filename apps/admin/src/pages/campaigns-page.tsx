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
import { CampaignFormModal } from '@admin/features/campaigns/campaign-form';
import { CampaignTable } from '@admin/features/campaigns/campaign-table';
import { fetchCampaigns } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function CampaignsPage() {
  const canManage = useCanManage('campaigns');
  const [adding, setAdding] = useState(false);
  const {
    data: campaigns,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  return (
    <section>
      <PageHeader
        title="Campaigns"
        subtitle="Promotional cards shown as a carousel on the parent Home screen."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add campaign
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={10} />}
      {error != null && !campaigns && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
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
      {adding && <CampaignFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
