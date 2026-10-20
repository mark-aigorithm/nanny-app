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
import { AppReleaseFormModal } from '@admin/features/app-releases/app-release-form';
import { AppReleaseTable } from '@admin/features/app-releases/app-release-table';
import { ReleaseStatusCard } from '@admin/features/app-releases/release-status';
import { fetchAppReleases } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function AppReleasesPage() {
  const canManage = useCanManage('settings');
  const [adding, setAdding] = useState(false);
  const { data: releases, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['app-releases'],
    queryFn: fetchAppReleases,
  });

  return (
    <section>
      <PageHeader
        title="App Releases"
        subtitle="Record each build once it is live in the store. Users below the newest mandatory release must update; users below the newest release get a prompt they can dismiss."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add release
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={6} />}
      {error != null && !releases && (
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
      )}
      {releases && (
        <>
          {error != null && (
            <StaleRefreshBanner message={apiErrorMessage(error)} onRetry={() => void refetch()} retrying={isFetching} />
          )}
          <div className="release-status-grid">
            <ReleaseStatusCard platform="ios" releases={releases} />
            <ReleaseStatusCard platform="android" releases={releases} />
          </div>
          <h2 className="release-history-heading">History</h2>
          <AppReleaseTable releases={releases} />
        </>
      )}
      {adding && <AppReleaseFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
