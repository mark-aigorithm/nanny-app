import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminNanny, Skill } from '@nanny-app/shared';

import { Badge, Button, Feedback } from '@admin/components/ui';
import { setNannySkills } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type NannySkillsEditorProps = {
  nanny: AdminNanny;
  /** Active skill catalog to choose from. */
  skills: Skill[];
  onDone: () => void;
};

type SkillOption = { id: number; name: string; isActive: boolean };

// Numeric-aware, so "Test Skill 2" sorts before "Test Skill 10".
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * The active catalog plus any skill she holds that has since been
 * deactivated. The backend lets her keep those, so they must be visible here —
 * a hidden-but-selected skill would be saved without the admin knowing.
 */
function skillOptions(nanny: AdminNanny, skills: Skill[]): SkillOption[] {
  const activeIds = new Set(skills.map((s) => s.id));
  const options: SkillOption[] = [
    ...skills.map((s) => ({ id: s.id, name: s.name, isActive: true })),
    ...nanny.skills
      .filter((s) => !activeIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, isActive: false })),
  ];
  return options.sort((a, b) => byName.compare(a.name, b.name));
}

export function NannySkillsEditor({ nanny, skills, onDone }: NannySkillsEditorProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(nanny.skills.map((s) => s.id)),
  );
  const options = skillOptions(nanny, skills);
  const holdsInactive = options.some((o) => !o.isActive);

  const saveMutation = useMutation({
    mutationFn: () => setNannySkills(nanny.id, { skillIds: [...selected] }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });
      // Also refresh the nanny detail page's data if it's what's open.
      void queryClient.invalidateQueries({ queryKey: ['nanny', nanny.id] });
      onDone();
    },
  });

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="skills-editor">
      {options.length === 0 ? (
        <p className="empty-state">
          No active skills yet — create some on the Skills page first.
        </p>
      ) : (
        <div className="skills-editor-grid">
          {options.map((option) => (
            <label key={option.id} className="skills-editor-option">
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                onChange={() => toggle(option.id)}
              />
              {option.name}
              {!option.isActive && <Badge tone="warning">Inactive</Badge>}
            </label>
          ))}
        </div>
      )}
      {holdsInactive && (
        <p className="field-hint">
          Inactive skills are hidden from parents. She can keep one she already has, but once
          removed it can't be added back until the skill is reactivated.
        </p>
      )}
      {saveMutation.error != null && (
        <Feedback tone="error">{apiErrorMessage(saveMutation.error)}</Feedback>
      )}
      <div className="row-actions">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save skills'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={saveMutation.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
