import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Camera } from '@nanny-app/shared';

import { ErrorState, PageHeader, StaleRefreshBanner, TableSkeleton } from '@admin/components/ui';
import { CameraForm } from '@admin/features/cameras/camera-form';
import { CameraTable } from '@admin/features/cameras/camera-table';
import { fetchCameras } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function CamerasPage() {
  const canManage = useCanManage('cameras');
  const [editing, setEditing] = useState<Camera | null>(null);
  const { data: cameras, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['cameras'],
    queryFn: fetchCameras,
  });

  return (
    <section>
      <PageHeader
        title="Cameras"
        subtitle="Manage camera streams and optionally assign them to a nanny."
      />
      {canManage && (
        <CameraForm
          key={editing?.id ?? 'new'}
          editing={editing ?? undefined}
          onDone={() => setEditing(null)}
        />
      )}
      {isLoading && <TableSkeleton columns={5} />}
      {error != null && !cameras && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {cameras && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <CameraTable cameras={cameras} onEdit={setEditing} />
        </>
      )}
    </section>
  );
}
