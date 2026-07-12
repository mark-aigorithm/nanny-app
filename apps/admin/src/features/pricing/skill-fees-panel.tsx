import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Skill, SkillFeeType, UpdateSkillInput } from '@nanny-app/shared';

import { Badge, Button, Card, Feedback } from '@admin/components/ui';
import { fetchSkills, updateSkill } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type FeeChoice = 'NONE' | SkillFeeType;

function SkillFeeRow({ skill }: { skill: Skill }) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<FeeChoice>(skill.feeType ?? 'NONE');
  const [value, setValue] = useState(String(skill.feeValue));

  const mutation = useMutation({
    mutationFn: (input: UpdateSkillInput) => updateSkill(skill.id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });

  const dirty =
    choice !== (skill.feeType ?? 'NONE') || Number(value) !== skill.feeValue;

  function save() {
    const feeType = choice === 'NONE' ? null : choice;
    const feeValue = choice === 'NONE' ? 0 : Number(value) || 0;
    mutation.mutate({ feeType, feeValue });
  }

  const unit = choice === 'PERCENTAGE' ? '% of base' : choice === 'FLAT' ? 'EGP / hr' : '';

  return (
    <tr>
      <td>
        <span className="fee-skill-name">{skill.name}</span>
        {!skill.isActive && <Badge tone="neutral">Inactive</Badge>}
      </td>
      <td>
        <select
          className="status-select"
          value={choice}
          onChange={(e) => setChoice(e.target.value as FeeChoice)}
        >
          <option value="NONE">No fee</option>
          <option value="FLAT">Flat (EGP/hr)</option>
          <option value="PERCENTAGE">Percent of base</option>
        </select>
      </td>
      <td>
        <div className="fee-value-cell">
          <input
            type="number"
            min="0"
            step={choice === 'PERCENTAGE' ? '1' : '0.5'}
            value={value}
            disabled={choice === 'NONE'}
            onChange={(e) => setValue(e.target.value)}
            className="fee-value-input"
            aria-label={`${skill.name} fee value`}
          />
          {unit && <span className="fee-unit">{unit}</span>}
        </div>
      </td>
      <td>
        <Button
          variant="ghost"
          size="sm"
          onClick={save}
          disabled={!dirty || mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </Button>
      </td>
    </tr>
  );
}

export function SkillFeesPanel() {
  const { data: skills, isLoading, error } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  });

  return (
    <Card title="Per-skill add-on fees">
      <p className="panel-lead">
        Set what each specialty adds to the hourly rate when a parent selects it as a
        booking add-on. A flat fee adds EGP per hour; a percentage adds a share of the
        base rate per hour. Skills default to no fee. Create new skills on the{' '}
        <strong>Skills</strong> page.
      </p>
      {isLoading && <p>Loading skills…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {skills && skills.length === 0 && (
        <p className="empty-state">No skills yet — add some on the Skills page first.</p>
      )}
      {skills && skills.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Fee type</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <SkillFeeRow key={skill.id} skill={skill} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
