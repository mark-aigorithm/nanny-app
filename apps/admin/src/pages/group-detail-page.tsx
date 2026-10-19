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
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const group = useQuery({ queryKey: ['groups', groupId], queryFn: () => fetchUserGroup(groupId) });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['groups'] });
    void queryClient.invalidateQueries({ queryKey: ['mother-picker'] });
  };

  const add = useMutation({
    mutationFn: () => addUserGroupMembers(groupId, [...addSelection]),
    // The picker lists current members too and adding is idempotent, so count
    // what the server actually added.
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
      refresh();
    },
    onError: (err) => toast.error('Couldn’t remove them', apiErrorMessage(err)),
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
      {canManage && memberSelection.size > 0 && (
        <div className="filter-bar">
          <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove {memberSelection.size} from group
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
          onClose={() => setAdding(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAdding(false)} disabled={add.isPending}>
                Cancel
              </Button>
              <Button onClick={() => add.mutate()} disabled={n === 0 || add.isPending}>
                Add {mothers(n)}
              </Button>
            </>
          }
        >
          <MotherPickerTable selected={addSelection} onSelectedChange={setAddSelection} />
        </Modal>
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
