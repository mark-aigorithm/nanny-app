import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { UpdateAdminMotherSchema, type AdminMotherDetail } from '@nanny-app/shared';

import { Button, Feedback, Field, Modal, Select, useToast } from '@admin/components/ui';
import { updateMother } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type Props = {
  mother: AdminMotherDetail;
  onClose: () => void;
};

/** '-' is the "no last name" placeholder stored on accounts without a surname. */
const NO_LAST_NAME = '-';

export function MotherEditForm({ mother, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [firstName, setFirstName] = useState(mother.firstName);
  const [lastName, setLastName] = useState(
    mother.lastName === NO_LAST_NAME ? '' : mother.lastName,
  );
  const [isActive, setIsActive] = useState(mother.isActive);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      updateMother(String(mother.id), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        isActive,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['mother', String(mother.id)], updated);
      void queryClient.invalidateQueries({ queryKey: ['admin-mothers'] });
      toast.success('Account updated', `${updated.name}’s details were saved.`);
      onClose();
    },
    onError: (err) => toast.error('Couldn’t save changes', apiErrorMessage(err)),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = UpdateAdminMotherSchema.safeParse({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      isActive,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setFormError(issue ? issue.message : 'Invalid input');
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  return (
    <Modal
      title="Edit parent"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="mother-edit-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="mother-edit-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="First name">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Nour"
              required
              autoFocus
            />
          </Field>
          <Field label="Last name" hint="Optional — leave blank if none.">
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Ibrahim"
            />
          </Field>
          <div className="field">
            <span className="field-label">Account status</span>
            <Select
              value={isActive ? 'active' : 'inactive'}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Deactivated' },
              ]}
              onChange={(value) => setIsActive(value === 'active')}
            />
            <span className="field-hint">Whether the parent’s account is active.</span>
          </div>
        </div>
        {formError && <Feedback tone="error">{formError}</Feedback>}
      </form>
    </Modal>
  );
}
