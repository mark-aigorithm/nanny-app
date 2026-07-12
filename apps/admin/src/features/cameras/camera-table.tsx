import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Camera } from '@nanny-app/shared';

import { Badge, Button, Card } from '@admin/components/ui';
import { deleteCamera } from '@admin/lib/api';

type CameraTableProps = {
  cameras: Camera[];
  onEdit: (camera: Camera) => void;
};

export function CameraTable({ cameras, onEdit }: CameraTableProps) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: deleteCamera,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['cameras'] }),
  });

  if (cameras.length === 0) {
    return (
      <Card>
        <p className="empty-state">No cameras yet — add the first one above.</p>
      </Card>
    );
  }

  return (
    <Card flush>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Stream URL</th>
              <th>Nanny</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cameras.map((camera) => (
              <tr key={camera.id}>
                <td>{camera.name}</td>
                <td>
                  <a href={camera.streamUrl} target="_blank" rel="noreferrer">
                    {camera.streamUrl}
                  </a>
                </td>
                <td>
                  {camera.nannyName ? (
                    camera.nannyName
                  ) : (
                    <Badge tone="neutral">Unassigned</Badge>
                  )}
                </td>
                <td>{new Date(camera.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="row-actions">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(camera)}>
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete camera ${camera.name}?`)) {
                          deleteMutation.mutate(camera.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
