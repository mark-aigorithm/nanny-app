import { USER_GROUP_DESCRIPTION_MAX, USER_GROUP_NAME_MAX, type UserGroup } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Field, FormModal, Input, useToast } from '@admin/components/ui';
import { createUserGroup, updateUserGroup } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type GroupFormModalProps = {
  /** Omit to create a group. */
  group?: UserGroup;
  onClose: () => void;
  /** Runs after a successful save, e.g. to open the new group. */
  onSaved?: (group: UserGroup) => void;
};

/** The one create/edit dialog for a group. */
export function GroupFormModal({ group, onClose, onSaved }: GroupFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');

  const save = useMutation({
    mutationFn: () => {
      const input = { name, description };
      return group ? updateUserGroup(group.id, input) : createUserGroup(input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success(group ? 'Group saved' : 'Group created');
      onClose();
      onSaved?.(saved);
    },
  });

  return (
    <FormModal
      title={group ? 'Edit group' : 'New group'}
      submitLabel={group ? 'Save' : 'Create group'}
      onSubmit={() => save.mutate()}
      onClose={onClose}
      busy={save.isPending}
      submitDisabled={name.trim().length === 0}
      error={save.isError ? apiErrorMessage(save.error) : null}
      size="sm"
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={USER_GROUP_NAME_MAX} autoFocus />
      </Field>
      <Field label="Description" hint="Optional. Who is in this group and why.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={USER_GROUP_DESCRIPTION_MAX}
        />
      </Field>
    </FormModal>
  );
}
