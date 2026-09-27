import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { AdminNannyDetail } from '@nanny-app/shared';

import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  ICON_SIZE,
  Select,
  Video,
  useToast,
} from '@admin/components/ui';
import { assignNannyCamera, fetchCameras } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

type NannyCameraCardProps = {
  nanny: AdminNannyDetail;
};

/**
 * The camera parents watch during this nanny's bookings. Anyone who can manage
 * cameras hands her one from the free pool — or takes hers back — right here,
 * without a trip to the Cameras page.
 */
export function NannyCameraCard({ nanny }: NannyCameraCardProps) {
  const canManage = useCanManage('cameras');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<number | ''>('');
  const [confirmingUnassign, setConfirmingUnassign] = useState(false);

  const { data: cameras, isLoading, error } = useQuery({
    queryKey: ['cameras'],
    queryFn: fetchCameras,
    enabled: canManage,
  });
  const available = (cameras ?? []).filter((camera) => camera.nannyUserId === null);

  const assignMutation = useMutation({
    mutationFn: (cameraId: number | null) => assignNannyCamera(nanny.id, cameraId),
    onSuccess: (camera) => {
      queryClient.setQueryData<AdminNannyDetail>(['nanny', String(nanny.id)], (current) =>
        current ? { ...current, camera } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['nanny', String(nanny.id)] });
      void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });
      void queryClient.invalidateQueries({ queryKey: ['cameras'] });
      setSelected('');
      setConfirmingUnassign(false);
      if (camera) {
        toast.success('Camera assigned', `${camera.name} is now ${nanny.name}’s camera.`);
      } else {
        toast.success('Camera unassigned', `${nanny.name} no longer has a camera.`);
      }
    },
    onError: (err, cameraId) => {
      setConfirmingUnassign(false);
      toast.error(
        cameraId === null ? 'Couldn’t unassign camera' : 'Couldn’t assign camera',
        apiErrorMessage(err),
      );
      // Most likely another admin just took it — refresh so it leaves the list.
      void queryClient.invalidateQueries({ queryKey: ['cameras'] });
    },
  });

  function assignControls() {
    if (nanny.approvalStatus !== 'APPROVED') {
      return (
        <p className="field-hint">She can be given a camera once her application is approved.</p>
      );
    }
    if (error != null) {
      return (
        <p className="field-hint">Couldn’t load the available cameras: {apiErrorMessage(error)}</p>
      );
    }
    if (!isLoading && available.length === 0) {
      return (
        <p className="table-subtext">
          No cameras are free right now. <Link to="/cameras">Add one on the Cameras page</Link>, or
          unassign one from another nanny.
        </p>
      );
    }
    return (
      <>
        <div className="nanny-camera-assign-row">
          <Field label={nanny.camera ? 'Switch to another camera' : 'Assign a camera'}>
            <Select<number | ''>
              value={selected}
              options={available.map((camera) => ({ value: camera.id, label: camera.name }))}
              onChange={setSelected}
              placeholder={isLoading ? 'Loading cameras…' : 'Choose a camera'}
              disabled={isLoading || assignMutation.isPending}
            />
          </Field>
          <Button
            disabled={selected === '' || assignMutation.isPending}
            onClick={() => {
              if (selected !== '') assignMutation.mutate(selected);
            }}
          >
            {nanny.camera ? 'Switch camera' : 'Assign camera'}
          </Button>
        </div>
        <p className="field-hint">
          These are the available cameras — only ones not assigned to any nanny are listed.
          {nanny.camera && ' Switching puts her current camera back in the pool.'}
        </p>
      </>
    );
  }

  return (
    <Card
      className="detail-grid-wide"
      title="Camera"
      action={
        canManage && nanny.camera ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirmingUnassign(true)}>
            Unassign
          </Button>
        ) : undefined
      }
    >
      <div className="nanny-camera">
        <div className="nanny-camera-current">
          <span
            className={`nanny-camera-icon${nanny.camera ? '' : ' nanny-camera-icon--empty'}`}
            aria-hidden
          >
            <Video size={ICON_SIZE.stat} />
          </span>
          <div>
            <div className="nanny-camera-name">{nanny.camera?.name ?? 'Not assigned'}</div>
            <div className="table-subtext">
              {nanny.camera
                ? 'Parents watch this feed live during her bookings.'
                : 'Parents can’t watch her bookings live until she has one.'}
            </div>
          </div>
        </div>

        {canManage && <div className="nanny-camera-assign">{assignControls()}</div>}
      </div>

      {confirmingUnassign && nanny.camera && (
        <ConfirmDialog
          title="Unassign camera"
          message={`Take ${nanny.camera.name} away from ${nanny.name}? Parents won’t be able to watch her bookings live until she gets another camera.`}
          confirmLabel="Unassign camera"
          danger
          busy={assignMutation.isPending}
          onConfirm={() => assignMutation.mutate(null)}
          onCancel={() => setConfirmingUnassign(false)}
        />
      )}
    </Card>
  );
}
