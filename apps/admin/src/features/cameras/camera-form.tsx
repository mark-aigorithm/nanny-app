import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CreateCameraSchema, UpdateCameraSchema, type Camera } from '@nanny-app/shared';

import { Field, FormModal, Input, Select, type SelectOption, useToast } from '@admin/components/ui';
import { createCamera, fetchNannyOptions, updateCamera } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

type CameraFormModalProps = {
  /** The camera to edit; omit to add a new one. */
  camera?: Camera;
  onClose: () => void;
};

/** Add a camera, or edit one — the Cameras page's one dialog for both. */
export function CameraFormModal({ camera, onClose }: CameraFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(camera?.name ?? '');
  const [streamUrl, setStreamUrl] = useState(camera?.streamUrl ?? '');
  const [nannyUserId, setNannyUserId] = useState<number | ''>(camera?.nannyUserId ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: nannyOptions } = useQuery({
    queryKey: ['nanny-options'],
    queryFn: fetchNannyOptions,
  });

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<Camera>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['cameras'] });
      toast.success(camera ? 'Camera updated' : 'Camera added', saved.name);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    // Every field the form shows, on add and edit alike — "Unassigned" clears the nanny.
    const fields = {
      name: name.trim(),
      streamUrl: streamUrl.trim(),
      nannyUserId: nannyUserId === '' ? null : nannyUserId,
    };
    if (camera) {
      const parsed = UpdateCameraSchema.safeParse(fields);
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updateCamera(camera.id, parsed.data));
    } else {
      const parsed = CreateCameraSchema.safeParse(fields);
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createCamera(parsed.data));
    }
  }

  return (
    <FormModal
      title={camera ? 'Edit camera' : 'Add camera'}
      submitLabel={camera ? 'Save changes' : 'Add camera'}
      size="sm"
      busy={saveMutation.isPending}
      submitDisabled={name.trim() === '' || streamUrl.trim() === ''}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Name">
        <Input
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Living room"
        />
      </Field>
      <Field label="Stream URL">
        <Input
          type="url"
          value={streamUrl}
          onChange={(event) => setStreamUrl(event.target.value)}
          placeholder="https://stream.example.com/cam1"
        />
      </Field>
      <Field label="Assigned nanny" hint="Leave unassigned if not linked to a nanny.">
        <Select<number | ''>
          value={nannyUserId}
          placeholder="Unassigned"
          options={[
            { value: '', label: 'Unassigned' },
            ...(nannyOptions?.map(
              (option): SelectOption<number | ''> => ({
                value: option.userId,
                label: option.name,
              }),
            ) ?? []),
          ]}
          onChange={setNannyUserId}
        />
      </Field>
    </FormModal>
  );
}
