import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { CreateCameraSchema, UpdateCameraSchema, type Camera } from '@nanny-app/shared';

import { Button, Card, Feedback, Field, Select } from '@admin/components/ui';
import { createCamera, fetchNannyOptions, updateCamera } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type CameraFormProps = {
  /** When provided, the form edits this camera instead of creating a new one. */
  editing?: Camera;
  onDone?: () => void;
};

export function CameraForm({ editing, onDone }: CameraFormProps) {
  const queryClient = useQueryClient();
  const isEditing = editing != null;

  const [name, setName] = useState(editing?.name ?? '');
  const [streamUrl, setStreamUrl] = useState(editing?.streamUrl ?? '');
  const [nannyUserId, setNannyUserId] = useState(editing?.nannyUserId ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: nannyOptions } = useQuery({
    queryKey: ['nanny-options'],
    queryFn: fetchNannyOptions,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cameras'] });
  };

  const mutation = useMutation({
    mutationFn: (input: { name: string; streamUrl: string; nannyUserId: string | null }) =>
      isEditing ? updateCamera(editing.id, input) : createCamera(input),
    onSuccess: () => {
      setFormError(null);
      invalidate();
      if (isEditing) {
        onDone?.();
      } else {
        setName('');
        setStreamUrl('');
        setNannyUserId('');
      }
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: name.trim(),
      streamUrl: streamUrl.trim(),
      nannyUserId: nannyUserId ? nannyUserId : null,
    };
    const schema = isEditing ? UpdateCameraSchema : CreateCameraSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    mutation.mutate(payload);
  }

  return (
    <Card title={isEditing ? `Edit camera` : 'Add camera'}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Living room"
              required
            />
          </Field>
          <Field label="Stream URL">
            <input
              type="url"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://stream.example.com/cam1"
              required
            />
          </Field>
          <div className="field">
            <span className="field-label">Assigned nanny</span>
            <Select
              value={nannyUserId}
              placeholder="Unassigned"
              options={[
                { value: '', label: 'Unassigned' },
                ...(nannyOptions?.map((option) => ({
                  value: option.userId,
                  label: option.name,
                })) ?? []),
              ]}
              onChange={setNannyUserId}
            />
            <span className="field-hint">Leave unassigned if not linked to a nanny.</span>
          </div>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <div className="row-actions">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Saving…'
              : isEditing
                ? 'Save changes'
                : 'Add camera'}
          </Button>
          {isEditing && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
