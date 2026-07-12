import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminNanny, Skill } from '@nanny-app/shared';

import { Button, Feedback } from '@admin/components/ui';
import { setNannySkills } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type NannySkillsEditorProps = {
  nanny: AdminNanny;
  /** Active skill catalog to choose from. */
  skills: Skill[];
  onDone: () => void;
};

export function NannySkillsEditor({ nanny, skills, onDone }: NannySkillsEditorProps) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(nanny.skills.map((s) => s.id)),
  );

  const saveMutation = useMutation({
    mutationFn: () => setNannySkills(nanny.id, { skillIds: [...selected] }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-nannies'] });
      onDone();
    },
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="skills-editor">
      {skills.length === 0 ? (
        <p className="empty-state">
          No active skills yet — create some on the Skills page first.
        </p>
      ) : (
        <div className="skills-editor-grid">
          {skills.map((skill) => (
            <label key={skill.id} className="skills-editor-option">
              <input
                type="checkbox"
                checked={selected.has(skill.id)}
                onChange={() => toggle(skill.id)}
              />
              {skill.name}
            </label>
          ))}
        </div>
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
