import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { CreateSkillSchema } from '@nanny-app/shared';

import { Button, Card, Feedback, Field } from '@admin/components/ui';
import { createSkill } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function SkillForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createSkill,
    onSuccess: () => {
      setName('');
      setDescription('');
      setIsActive(true);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['skills'] });
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateSkillSchema.safeParse({
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
    <Card title="Create skill">
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="French speaker"
              required
            />
          </Field>
          <Field label="Description" hint="Optional — shown to admins only.">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fluent French for bilingual households"
            />
          </Field>
          <Field label="Status" hint="Inactive skills can't be assigned or filtered on.">
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating…' : 'Create skill'}
        </Button>
      </form>
    </Card>
  );
}
