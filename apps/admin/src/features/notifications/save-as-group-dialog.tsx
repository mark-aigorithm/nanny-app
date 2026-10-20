import type { UserGroup } from '@nanny-app/shared';
import { USER_GROUP_DESCRIPTION_MAX, USER_GROUP_NAME_MAX } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { Field, FormModal, Input } from '@admin/components/ui';
import { addUserGroupMembers, createUserGroup } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { mothersLabel } from './notification-labels';

/** POST /groups/:id/members takes at most this many ids at once (UserGroupMembersSchema). */
const MEMBERS_PER_CALL = 1000;

type SaveAsGroupDialogProps = {
  motherIds: number[];
  onClose: () => void;
  /** The group exists and holds every mother. */
  onSaved: (group: UserGroup) => void;
};

/**
 * Turn a hand-picked list into a static group, so it can be reused for
 * surveys and later notifications. Only rendered for admins who can manage
 * groups (POST /groups requires it).
 */
export function SaveAsGroupDialog({ motherIds, onClose, onSaved }: SaveAsGroupDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // A group created by an attempt whose member adds then failed: a retry fills it
  // rather than creating a second, half-empty group.
  const created = useRef<UserGroup | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const group =
        created.current ??
        (await createUserGroup({ name: name.trim(), description: description.trim(), kind: 'STATIC' }));
      created.current = group;
      let latest = group;
      for (let i = 0; i < motherIds.length; i += MEMBERS_PER_CALL) {
        latest = await addUserGroupMembers(group.id, motherIds.slice(i, i + MEMBERS_PER_CALL));
      }
      return latest;
    },
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      onSaved(group);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const error = save.isError
    ? created.current
      ? `“${created.current.name}” was created, but adding the mothers didn’t finish: ${apiErrorMessage(save.error)} Try again to finish.`
      : apiErrorMessage(save.error)
    : null;

  return (
    <FormModal
      title="Save as a static group"
      submitLabel={created.current ? 'Add the mothers' : 'Create group'}
      onSubmit={() => save.mutate()}
      onClose={onClose}
      busy={save.isPending}
      submitDisabled={name.trim().length === 0}
      error={error}
      size="sm"
    >
      <p className="modal-text">
        A hand-picked group of these {mothersLabel(motherIds.length)}. You can send surveys and notifications to it
        later.
      </p>
      <Field label="Group name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={USER_GROUP_NAME_MAX}
          disabled={created.current !== null}
          autoFocus
        />
      </Field>
      <Field label="Description" hint="Optional. Who is in this group and why.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={USER_GROUP_DESCRIPTION_MAX}
          disabled={created.current !== null}
        />
      </Field>
    </FormModal>
  );
}
