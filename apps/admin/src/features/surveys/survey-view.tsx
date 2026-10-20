import type { AdminSurvey } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  ActionMenu,
  Button,
  Card,
  ConfirmDialog,
  Copy,
  DescriptionList,
  DetailHeader,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  Send,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteSurvey, duplicateSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { SurveyPreview } from './survey-preview';

type SurveyViewProps = {
  survey: AdminSurvey;
  /** Opens the editor on this draft. */
  onEdit: () => void;
  /** Opens the publish flow (pick who gets it). */
  onPublish: () => void;
};

/**
 * A saved draft as mothers will see it, with Edit, Publish, and Duplicate and
 * Delete in its menu. Publishing needs at least one question.
 */
export function SurveyView({ survey, onEdit, onPublish }: SurveyViewProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('surveys');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const questions = survey.questions.map((q) => ({
    type: q.type,
    prompt: q.prompt,
    required: q.required,
    options: q.options.map((o) => o.label),
  }));
  const required = questions.filter((q) => q.required).length;
  const canPublish = questions.length > 0;

  const duplicate = useMutation({
    mutationFn: () => duplicateSurvey(survey.id),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      toast.success('Survey duplicated');
      navigate(`/surveys/${copy.id}`);
    },
    onError: (err) => toast.error('Couldn’t duplicate the survey', apiErrorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => deleteSurvey(survey.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      toast.success('Draft deleted');
      navigate('/surveys');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Couldn’t delete the draft', apiErrorMessage(err));
    },
  });

  return (
    <section>
      <DetailHeader
        title={survey.title}
        subtitle="Draft — not sent yet. Publish sends it to the mothers you choose."
        backTo="/surveys"
        backLabel="Surveys"
        actions={
          canManage && (
            <>
              <Button variant="ghost" onClick={onEdit}>
                <Pencil size={ICON_SIZE.inline} aria-hidden />
                Edit
              </Button>
              <Button onClick={onPublish} disabled={!canPublish}>
                <Send size={ICON_SIZE.inline} aria-hidden />
                Publish
              </Button>
              <ActionMenu label="More actions for this draft">
                <MenuItem
                  icon={<Copy size={ICON_SIZE.menu} />}
                  disabled={duplicate.isPending}
                  onSelect={() => duplicate.mutate()}
                >
                  Duplicate
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<Trash2 size={ICON_SIZE.menu} />}
                  onSelect={() => setConfirmDelete(true)}
                >
                  Delete draft
                </MenuItem>
              </ActionMenu>
            </>
          )
        }
      />
      <div className="template-view">
        <SurveyPreview
          title={survey.title}
          questions={questions}
          wide
        />
        <Card title="Details">
          <DescriptionList
            items={[
              { label: 'Status', value: 'Draft', wide: true },
              {
                label: 'Questions',
                value:
                  questions.length === 0 ? (
                    <>
                      None yet
                      {canManage && (
                        <span className="desc-note">Add at least one question to publish.</span>
                      )}
                    </>
                  ) : (
                    `${questions.length} · ${required} required`
                  ),
                wide: true,
              },
            ]}
          />
        </Card>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this draft?"
          message="It has not been sent to anyone."
          confirmLabel="Delete draft"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </section>
  );
}
