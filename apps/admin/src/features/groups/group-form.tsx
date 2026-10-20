import {
  USER_GROUP_DESCRIPTION_MAX,
  USER_GROUP_NAME_MAX,
  type UserGroup,
  type UserGroupKind,
} from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { Field, FormModal, Input, SegmentedControl, useToast, type SegmentedOption } from '@admin/components/ui';
import { createUserGroup, updateUserGroup } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { GROUP_KIND_HINT, GROUP_KIND_LABEL } from './group-labels';

const KIND_OPTIONS: readonly SegmentedOption<UserGroupKind>[] = (['STATIC', 'DYNAMIC'] as const).map((value) => ({
  value,
  label: GROUP_KIND_LABEL[value],
}));

type GroupFormModalProps = {
  /** Omit to create a group. */
  group?: UserGroup;
  onClose: () => void;
  /** Runs after a successful save, e.g. to open the new group. */
  onSaved?: (group: UserGroup) => void;
};

/**
 * The one create/edit dialog for a group. Creating asks Static or Dynamic —
 * fixed from then on. A dynamic group starts with no rules (every active
 * mother); its rules are set on its own page.
 */
export function GroupFormModal({ group, onClose, onSaved }: GroupFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [kind, setKind] = useState<UserGroupKind>('STATIC');
  const kindHintId = useId();

  const save = useMutation({
    mutationFn: () => {
      if (group) return updateUserGroup(group.id, { name, description });
      return createUserGroup(
        kind === 'DYNAMIC' ? { name, description, kind, rules: [] } : { name, description, kind },
      );
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
      {!group && (
        <div className="field">
          <SegmentedControl legend="Type" value={kind} options={KIND_OPTIONS} onChange={setKind} describedBy={kindHintId} />
          <span className="field-hint" id={kindHintId}>
            {GROUP_KIND_HINT[kind]}
            {kind === 'DYNAMIC' ? ' You set the rules on the next page; until then it matches every active mother.' : ''}
          </span>
        </div>
      )}
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
