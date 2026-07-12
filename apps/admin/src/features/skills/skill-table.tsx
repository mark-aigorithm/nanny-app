import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Skill, UpdateSkillInput } from '@nanny-app/shared';

import { Badge, Button, Card } from '@admin/components/ui';
import { deleteSkill, updateSkill } from '@admin/lib/api';

type SkillTableProps = {
  skills: Skill[];
};

export function SkillTable({ skills }: SkillTableProps) {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSkillInput }) =>
      updateSkill(id, input),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSkill,
    onSuccess: invalidate,
  });

  function handleEdit(skill: Skill) {
    const name = window.prompt('Skill name:', skill.name);
    if (name === null) return; // cancelled
    const description = window.prompt('Description (optional):', skill.description ?? '');
    if (description === null) return; // cancelled
    updateMutation.mutate({
      id: skill.id,
      input: { name: name.trim(), description: description.trim() || undefined },
    });
  }

  if (skills.length === 0) {
    return (
      <Card>
        <p className="empty-state">No skills yet — create the first one above.</p>
      </Card>
    );
  }

  return (
    <Card flush>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {skills.map((skill) => (
              <tr key={skill.id}>
                <td>{skill.name}</td>
                <td>{skill.description ?? '—'}</td>
                <td>
                  <Badge tone={skill.isActive ? 'success' : 'neutral'}>
                    {skill.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(skill)}
                      disabled={updateMutation.isPending}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({
                          id: skill.id,
                          input: { isActive: !skill.isActive },
                        })
                      }
                      disabled={updateMutation.isPending}
                    >
                      {skill.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete skill "${skill.name}"?`)) {
                          deleteMutation.mutate(skill.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
