import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  Button,
  ConfirmDialog,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  LoadingState,
  Modal,
  Pencil,
  Plus,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { GroupFormModal } from '@admin/features/groups/group-form';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import {
  addUserGroupMembers,
  deleteUserGroup,
  fetchUserGroup,
  removeUserGroupMembers,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

const mothers = (n: number) => `${n} mother${n === 1 ? '' : 's'}`;

/** One group: its members (the picker filtered to the group) and a picker to add more. */
export function GroupDetailPage() {
  const { id = '' } = useParams();
  const groupId = Number(id);
  const canManage = useCanManage('groups');
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [memberSelection, setMemberSelection] = useState<Set<number>>(new Set());
  const [addSelection, setAddSelection] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const group = useQuery({ queryKey: ['groups', groupId], queryFn: () => fetchUserGroup(groupId) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['mother-picker'] });
  };

  const add = useMutation({
    mutationFn: () => addUserGroupMembers(groupId, [...addSelection]),
    // The picker leaves current members out, but another admin may have added
    // one meanwhile (adding is idempotent), so count what the server added.
    onSuccess: (updated) => {
      const added = Math.max(0, updated.memberCount - (group.data?.memberCount ?? 0));
      toast.success(added === 0 ? 'They were already in the group' : `Added ${mothers(added)}`);
      setAddSelection(new Set());
      setAdding(false);
      refresh();
    },
    onError: (err) => toast.error('Couldn’t add them', apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => removeUserGroupMembers(groupId, [...memberSelection]),
    onSuccess: () => {
      toast.success(`Removed ${mothers(memberSelection.size)}`);
      setMemberSelection(new Set());
      setRemoving(false);
      refresh();
    },
    onError: (err) => {
      setRemoving(false);
      toast.error('Couldn’t remove them', apiErrorMessage(err));
    },
  });
  const del = useMutation({
    mutationFn: () => deleteUserGroup(groupId),
    onSuccess: () => {
      toast.success('Group deleted');
      refresh();
      navigate('/groups');
    },
    onError: (err) => toast.error('Couldn’t delete the group', apiErrorMessage(err)),
  });

  if (group.isLoading) return <LoadingState label="Loading group…" />;
  if (group.error != null || !group.data) {
    return <ErrorState message={apiErrorMessage(group.error)} onRetry={() => void group.refetch()} retrying={group.isFetching} />;
  }

  const n = addSelection.size;
  const closeAdd = () => {
    setAddSelection(new Set());
    setDiscarding(false);
    setAdding(false);
  };
  // Ticks across pages are real work: ask before Escape or Close drops them.
  const requestCloseAdd = () => (n === 0 ? closeAdd() : setDiscarding(true));
  const m = memberSelection.size;
  return (
    <section>
      <DetailHeader
        title={group.data.name}
        subtitle={[mothers(group.data.memberCount), group.data.description].filter(Boolean).join(' · ')}
        backTo="/groups"
        backLabel="Groups"
        actions={
          canManage && (
            <>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                <Pencil size={ICON_SIZE.inline} aria-hidden />
                Edit
              </Button>
              <Button variant="danger" onClick={() => setDeleting(true)}>
                <Trash2 size={ICON_SIZE.inline} aria-hidden />
                Delete
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus size={ICON_SIZE.inline} aria-hidden />
                Add mothers
              </Button>
            </>
          )
        }
      />
      {canManage && (
        // Always rendered (disabled at 0) so the first tick doesn't push the table down.
        <div className="filter-bar">
          <Button variant="danger" onClick={() => setRemoving(true)} disabled={m === 0 || remove.isPending}>
            {m === 0 ? 'Remove from group' : `Remove ${m} from group`}
          </Button>
        </div>
      )}
      <MotherPickerTable
        groupId={groupId}
        selected={memberSelection}
        onSelectedChange={setMemberSelection}
        selectable={canManage}
      />

      {adding && (
        <Modal
          title="Add mothers"
          size="lg"
          onClose={requestCloseAdd}
          dismissible={n === 0}
          footer={
            <>
              <Button variant="ghost" onClick={requestCloseAdd} disabled={add.isPending}>
                Cancel
              </Button>
              <Button onClick={() => add.mutate()} disabled={n === 0 || add.isPending}>
                Add {mothers(n)}
              </Button>
            </>
          }
        >
          <MotherPickerTable selected={addSelection} onSelectedChange={setAddSelection} excludeGroupId={groupId} />
          {discarding && (
            <ConfirmDialog
              title="Discard your selection?"
              message={`The ${mothers(n)} you ticked won’t be added.`}
              confirmLabel="Discard"
              cancelLabel="Keep picking"
              danger
              onConfirm={closeAdd}
              onCancel={() => setDiscarding(false)}
            />
          )}
        </Modal>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${mothers(m)} from this group?`}
          message="They stay in the app, and anything already sent to the group is not affected."
          confirmLabel="Remove"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setRemoving(false)}
        />
      )}
      {editing && <GroupFormModal group={group.data} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete this group?"
          message="Anything already sent to it is not affected, and the mothers stay in the app."
          confirmLabel="Delete group"
          danger
          busy={del.isPending}
          onConfirm={() => del.mutate()}
          onCancel={() => setDeleting(false)}
        />
      )}
    </section>
  );
}
