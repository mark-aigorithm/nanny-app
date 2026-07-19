import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { CreateCertificationSchema } from '@nanny-app/shared';

import { Button, Card, Feedback, Field, Select } from '@admin/components/ui';
import { createCertification } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function CertificationForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createCertification,
    onSuccess: () => {
      setName('');
      setDescription('');
      setIsActive(true);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['certifications'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateCertificationSchema.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid input');
      return;
    }
    createMutation.mutate(parsed.data);
  }

  return (
    <Card title="Create certification">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CPR"
              required
            />
          </Field>
          <Field label="Description" hint="Optional — shown to admins only.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cardiopulmonary resuscitation certified"
            />
          </Field>
          <div className="field">
            <span className="field-label">Status</span>
            <Select
              value={isActive ? 'active' : 'inactive'}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              onChange={(value) => setIsActive(value === 'active')}
            />
            <span className="field-hint">Inactive certifications can't be selected by nannies.</span>
          </div>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating…' : 'Create certification'}
        </Button>
      </form>
    </Card>
  );
}
