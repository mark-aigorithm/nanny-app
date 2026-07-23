import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Skill, SkillFeeType } from '@nanny-app/shared';

import {
  Badge,
  Button,
  Card,
  Feedback,
  LoadingState,
  Select,
  useToast,
  type SelectOption,
} from '@admin/components/ui';
import { fetchSkills, updateSkill } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type FeeChoice = 'NONE' | SkillFeeType;

/** An edited-but-unsaved row. Rows without one render straight from the server. */
type Draft = { choice: FeeChoice; value: string };

const FEE_CHOICES: SelectOption[] = [
  { value: 'NONE', label: 'No fee' },
  { value: 'FLAT', label: 'Flat (EGP/hr)' },
  { value: 'PERCENTAGE', label: 'Percent of base' },
];

function savedDraft(skill: Skill): Draft {
  return { choice: skill.feeType ?? 'NONE', value: String(skill.feeValue) };
}

type SkillFeeRowProps = {
  skill: Skill;
  draft: Draft;
  dirty: boolean;
  disabled: boolean;
  onChange: (draft: Draft) => void;
};

function SkillFeeRow({ skill, draft, dirty, disabled, onChange }: SkillFeeRowProps) {
  const unit =
    draft.choice === 'PERCENTAGE' ? '% of base' : draft.choice === 'FLAT' ? 'EGP / hr' : '';

  return (
    <tr>
      <td>
        <span className="fee-skill-name">{skill.name}</span>
        {!skill.isActive && <Badge tone="neutral">Inactive</Badge>}
      </td>
      <td>
        <Select
          compact
          value={draft.choice}
          options={FEE_CHOICES}
          onChange={(next) => onChange({ ...draft, choice: next as FeeChoice })}
          aria-label={`${skill.name} fee type`}
        />
      </td>
      <td>
        <div className="fee-value-cell">
          <input
            type="number"
            min="0"
            step={draft.choice === 'PERCENTAGE' ? '1' : '0.5'}
            value={draft.value}
            disabled={draft.choice === 'NONE' || disabled}
            onChange={(e) => onChange({ ...draft, value: e.target.value })}
            className="fee-value-input"
            aria-label={`${skill.name} fee value`}
          />
          {unit && <span className="fee-unit">{unit}</span>}
        </div>
      </td>
      <td>{dirty && <Badge tone="warning">Edited</Badge>}</td>
    </tr>
  );
}

export function SkillFeesPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: skills, isLoading, error } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  });

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  function draftFor(skill: Skill): Draft {
    return drafts[skill.id] ?? savedDraft(skill);
  }

  function isDirty(skill: Skill): boolean {
    const draft = drafts[skill.id];
    if (!draft) return false;
    const saved = savedDraft(skill);
    return draft.choice !== saved.choice || Number(draft.value) !== Number(saved.value);
  }

  const dirtySkills = (skills ?? []).filter(isDirty);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // One request per edited skill — the API updates skills individually.
      await Promise.all(
        dirtySkills.map((skill) => {
          const draft = draftFor(skill);
          const feeType = draft.choice === 'NONE' ? null : draft.choice;
          return updateSkill(skill.id, {
            feeType,
            feeValue: feeType === null ? 0 : Number(draft.value) || 0,
          });
        }),
      );
      return dirtySkills.length;
    },
    onSuccess: (count) => {
      setDrafts({});
      toast.success(
        'Add-on fees saved',
        `${count} skill${count === 1 ? '' : 's'} updated — new bookings price with the new fees.`,
      );
    },
    onError: (err) => toast.error('Couldn’t save add-on fees', apiErrorMessage(err)),
    // Refetch either way: a partial failure still changed some skills, and the
    // fresh rows are what tells us which drafts are genuinely still unsaved.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills'] }),
  });

  return (
    <Card>
      <div className="card-header">
        <h3>Per-skill add-on fees</h3>
        <div className="card-header-actions">
          {dirtySkills.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setDrafts({})}>
              Discard
            </Button>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={dirtySkills.length === 0 || saveMutation.isPending}
          >
            {saveMutation.isPending
              ? 'Saving…'
              : dirtySkills.length > 0
                ? `Save ${dirtySkills.length} change${dirtySkills.length === 1 ? '' : 's'}`
                : 'Save changes'}
          </Button>
        </div>
      </div>
      <p className="panel-lead">
        Set what each specialty adds to the hourly rate when a parent selects it as a
        booking add-on. A flat fee adds EGP per hour; a percentage adds a share of the
        base rate per hour. Skills default to no fee. Create new skills on the{' '}
        <strong>Skills</strong> page.
      </p>
      {isLoading && <LoadingState label="Loading skills…" />}
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
                <SkillFeeRow
                  key={skill.id}
                  skill={skill}
                  draft={draftFor(skill)}
                  dirty={isDirty(skill)}
                  disabled={saveMutation.isPending}
                  onChange={(draft) => setDrafts((prev) => ({ ...prev, [skill.id]: draft }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
