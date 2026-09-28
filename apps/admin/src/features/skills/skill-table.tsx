import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Skill, UpdateSkillInput } from '@nanny-app/shared';

import {
  ActionMenu,
  actionsColumn,
  Badge,
  Check,
  type Column,
  idColumn,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { SkillFormModal } from '@admin/features/skills/skill-form';
import { deleteSkill, updateSkill } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useClientSort } from '@admin/lib/use-table-sort';

type SkillSortKey = 'id' | 'name' | 'status';

type SkillTableProps = {
  skills: Skill[];
};

export function SkillTable({ skills }: SkillTableProps) {
  const canManage = useCanManage('skills');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

  const { rows, sort, onSortChange } = useClientSort<Skill, SkillSortKey>(
    skills,
    {
      id: (row) => row.id,
      name: (skill) => skill.name,
      status: (skill) => (skill.isActive ? 'Active' : 'Inactive'),
    },
    { sortBy: 'name', sortDir: 'asc' },
  );

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateSkillInput }) => updateSkill(id, input),
    onSuccess: (updated) => {
      invalidate();
      toast.success('Skill updated', updated.name);
    },
    onError: (err) => toast.error('Couldn’t update skill', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Skill deleted');
    },
    onError: (err) => toast.error('Couldn’t delete skill', apiErrorMessage(err)),
  });

  const columns: Column<Skill, SkillSortKey>[] = [
    idColumn((row) => row.id, 'id'),
    // The name gets the room; a skill's description lives in its edit dialog.
    { key: 'name', header: 'Name', sortKey: 'name', width: '60%', render: (skill) => skill.name },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (skill) => (
        <Badge tone={skill.isActive ? 'success' : 'neutral'}>
          {skill.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    actionsColumn((skill) => (
      <ActionMenu label={`Actions for ${skill.name}`} disabled={!canManage}>
        <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(skill)}>
          Edit
        </MenuItem>
        <MenuItem
          icon={skill.isActive ? <Power size={ICON_SIZE.menu} /> : <Check size={ICON_SIZE.menu} />}
          disabled={updateMutation.isPending}
          onSelect={() =>
            updateMutation.mutate({ id: skill.id, input: { isActive: !skill.isActive } })
          }
        >
          {skill.isActive ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 size={ICON_SIZE.menu} />}
          onSelect={() => setDeleting(skill)}
        >
          Delete
        </MenuItem>
      </ActionMenu>
    )),
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={rows ?? []}
        rowKey={(skill) => skill.id}
        empty="No skills yet — add the first one with “Add skill”."
        sort={sort}
        onSortChange={onSortChange}
      />

      {editing && <SkillFormModal skill={editing} onClose={() => setEditing(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete skill"
          message={`Delete “${deleting.name}”? Nannies tagged with it will lose the tag. This can’t be undone.`}
          confirmLabel="Delete skill"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
