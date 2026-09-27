import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  CreateCertificationSchema,
  UpdateCertificationSchema,
  type Certification,
} from '@nanny-app/shared';

import { Field, FormModal, Input, Select, useToast } from '@admin/components/ui';
import { createCertification, updateCertification } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';

type CertificationFormModalProps = {
  /** The certification to edit; omit to add a new one. */
  certification?: Certification;
  onClose: () => void;
};

/** Add a certification, or edit one — the Certifications page's one dialog for both. */
export function CertificationFormModal({ certification, onClose }: CertificationFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(certification?.name ?? '');
  const [description, setDescription] = useState(certification?.description ?? '');
  const [isActive, setIsActive] = useState(certification?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<Certification>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['certifications'] });
      toast.success(certification ? 'Certification updated' : 'Certification added', saved.name);
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  function submit() {
    setFormError(null);
    const fields = { name: name.trim(), description: description.trim() || undefined, isActive };
    if (certification) {
      const parsed = UpdateCertificationSchema.safeParse(fields);
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => updateCertification(certification.id, parsed.data));
    } else {
      const parsed = CreateCertificationSchema.safeParse(fields);
      if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
      saveMutation.mutate(() => createCertification(parsed.data));
    }
  }

  return (
    <FormModal
      title={certification ? 'Edit certification' : 'Add certification'}
      submitLabel={certification ? 'Save changes' : 'Add certification'}
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
          placeholder="CPR"
        />
      </Field>
      <Field label="Description" hint="Optional — shown to admins only.">
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Cardiopulmonary resuscitation certified"
        />
      </Field>
      <Field label="Status" hint="Inactive certifications can’t be selected by nannies.">
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
