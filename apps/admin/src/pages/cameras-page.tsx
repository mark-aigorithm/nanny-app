import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Camera } from '@nanny-app/shared';

import { Feedback, PageHeader } from '@admin/components/ui';
import { CameraForm } from '@admin/features/cameras/camera-form';
import { CameraTable } from '@admin/features/cameras/camera-table';
import { fetchCameras } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function CamerasPage() {
  const [editing, setEditing] = useState<Camera | null>(null);
  const { data: cameras, isLoading, error } = useQuery({
    queryKey: ['cameras'],
    queryFn: fetchCameras,
  });

  return (
    <section>
      <PageHeader
        title="Cameras"
        subtitle="Manage camera streams and optionally assign them to a nanny."
      />
      <CameraForm
        key={editing?.id ?? 'new'}
        editing={editing ?? undefined}
        onDone={() => setEditing(null)}
      />
      {isLoading && <p>Loading cameras…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {cameras && <CameraTable cameras={cameras} onEdit={setEditing} />}
    </section>
  );
}
