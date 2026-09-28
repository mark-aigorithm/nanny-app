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
import { CameraFormModal } from '@admin/features/cameras/camera-form';
import { CameraTable } from '@admin/features/cameras/camera-table';
import { fetchCameras } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function CamerasPage() {
  const canManage = useCanManage('cameras');
  const [adding, setAdding] = useState(false);
  const {
    data: cameras,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['cameras'],
    queryFn: fetchCameras,
  });

  return (
    <section>
      <PageHeader
        title="Cameras"
        subtitle="Manage camera streams and optionally assign them to a nanny."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add camera
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={6} />}
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
          <CameraTable cameras={cameras} />
        </>
      )}
      {adding && <CameraFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
