import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Skill, UpdateSkillInput } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Button,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Modal,
  Pencil,
  Power,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteSkill, updateSkill } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type SkillTableProps = {
  skills: Skill[];
};

export function SkillTable({ skills }: SkillTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Skill | null>(null);
  const [deleting, setDeleting] = useState<Skill | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateSkillInput }) => updateSkill(id, input),
    onSuccess: (updated) => {
      invalidate();
      setEditing(null);
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

  const columns: Column<Skill>[] = [
    { key: 'name', header: 'Name', render: (skill) => skill.name },
    {
      key: 'description',
      header: 'Description',
      render: (skill) => skill.description ?? <span className="table-empty">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (skill) => (
        <Badge tone={skill.isActive ? 'success' : 'neutral'}>
          {skill.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (skill) => (
        <ActionMenu label={`Actions for ${skill.name}`}>
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
          <MenuItem danger icon={<Trash2 size={ICON_SIZE.menu} />} onSelect={() => setDeleting(skill)}>
            Delete
          </MenuItem>
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={skills}
        rowKey={(skill) => skill.id}
        empty="No skills yet — create the first one above."
      />

      {editing && (
        <SkillEditModal
          skill={editing}
          busy={updateMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
      )}

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

function SkillEditModal({
  skill,
  busy,
  onCancel,
  onSave,
}: {
  skill: Skill;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: UpdateSkillInput) => void;
}) {
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description ?? '');
  const canSave = !busy && name.trim().length > 0;

  return (
    <Modal
      title="Edit skill"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined })}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="modal-field field">
        <label className="field-label" htmlFor="skill-name">
          Name
        </label>
        <input
          id="skill-name"
          className="input"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="modal-field field">
        <label className="field-label" htmlFor="skill-description">
          Description
        </label>
        <input
          id="skill-description"
          className="input"
          value={description}
          placeholder="Optional — shown to admins only"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Modal>
  );
}
