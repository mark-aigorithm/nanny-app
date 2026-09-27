import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CreateSkillSchema, UpdateSkillSchema, type Skill } from '@nanny-app/shared';

import { Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { createSkill, updateSkill } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

type SkillFormModalProps = {
  /** The skill to edit; omit to add a new one. */
  skill?: Skill;
  onClose: () => void;
};

/** Add a skill, or edit one — the Nanny Skills page's one dialog for both. */
export function SkillFormModal({ skill, onClose }: SkillFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [isActive, setIsActive] = useState(skill?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<Skill>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['skills'] });
      toast.success(skill ? 'Skill updated' : 'Skill added', saved.name);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    const fields = { name: name.trim(), description: description.trim() || undefined, isActive };
    if (skill) {
      // Only what this form shows — a skill's fee, set elsewhere, stays as it is.
      const parsed = UpdateSkillSchema.safeParse(fields);
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updateSkill(skill.id, parsed.data));
    } else {
      const parsed = CreateSkillSchema.safeParse(fields);
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createSkill(parsed.data));
    }
  }

  return (
    <FormModal
      title={skill ? 'Edit skill' : 'Add skill'}
      submitLabel={skill ? 'Save changes' : 'Add skill'}
      size="sm"
      busy={saveMutation.isPending}
      submitDisabled={name.trim() === ''}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Name">
        <Input
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="French speaker"
        />
      </Field>
      <Field label="Description" hint="Optional — shown to admins only.">
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Fluent French for bilingual households"
        />
      </Field>
      <Field label="Status" hint="Inactive skills can’t be assigned or filtered on.">
        <Select
          value={isActive ? 'active' : 'inactive'}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          onChange={(value) => setIsActive(value === 'active')}
        />
      </Field>
    </FormModal>
  );
}
