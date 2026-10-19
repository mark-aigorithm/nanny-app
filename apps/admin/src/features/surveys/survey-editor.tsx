import type { AdminSurvey, SurveyDraftInput } from '@nanny-app/shared';
import { SURVEY_DESCRIPTION_MAX, SURVEY_MAX_QUESTIONS, SURVEY_TITLE_MAX, SurveyDraftSchema } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  ConfirmDialog,
  Copy,
  DetailHeader,
  Field,
  ICON_SIZE,
  Input,
  Plus,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { deleteSurvey, duplicateSurvey, updateSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { useCanManage } from '@admin/lib/permissions';

import { QuestionCard, type DraftQuestion } from './question-card';

let nextKey = 0;
const newKey = () => `q${nextKey++}`;

export function toDraftQuestions(survey: AdminSurvey): DraftQuestion[] {
  return survey.questions.map((q) => ({
    key: newKey(),
    type: q.type,
    prompt: q.prompt,
    required: q.required,
    options: q.options.map((o) => o.label),
  }));
}

type Props = {
  survey: AdminSurvey;
  /** Opens the publish flow. When omitted the Publish button is not rendered. */
  onPublish?: () => void;
};

/** The draft editor: title, description and questions, saved in one PATCH. */
export function SurveyEditor({ survey, onPublish }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('surveys');
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => toDraftQuestions(survey));
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Set just before the editor navigates away on purpose (after a delete), so
  // the unsaved-changes guard lets that one through.
  const leavingOnPurpose = useRef(false);

  // Unsaved edits: ask before an in-app navigation, and let the browser ask
  // before the tab closes or reloads.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingOnPurpose.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show the prompt only when returnValue is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const draft = useMemo<SurveyDraftInput>(
    () => ({
      title,
      description,
      questions: questions.map(({ type, prompt, required, options }) => ({ type, prompt, required, options })),
    }),
    [title, description, questions],
  );
  const validation = useMemo(() => SurveyDraftSchema.safeParse(draft), [draft]);
  const problem = validation.success ? null : firstIssueMessage(validation.error);

  const touch = (fn: () => void) => {
    fn();
    setDirty(true);
  };
  const updateAt = (i: number, next: DraftQuestion) =>
    touch(() => setQuestions((qs) => qs.map((q, j) => (j === i ? next : q))));
  const move = (i: number, delta: -1 | 1) =>
    touch(() =>
      setQuestions((qs) => {
        const next = [...qs];
        const [item] = next.splice(i, 1);
        next.splice(i + delta, 0, item!);
        return next;
      }),
    );

  const save = useMutation({
    mutationFn: () => updateSurvey(survey.id, draft),
    onSuccess: (saved) => {
      queryClient.setQueryData(['surveys', survey.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      setDirty(false);
      toast.success('Draft saved');
    },
    onError: (err) => toast.error('Couldn’t save the draft', apiErrorMessage(err)),
  });
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
      leavingOnPurpose.current = true;
      navigate('/surveys');
    },
    onError: (err) => {
      setConfirmDelete(false);
      toast.error('Couldn’t delete the draft', apiErrorMessage(err));
    },
  });

  // Inputs lock while a save is in flight so an edit can't be marked saved by its response.
  const locked = !canManage || save.isPending;
  const canPublish = !dirty && questions.length > 0 && validation.success;

  return (
    <section>
      <DetailHeader
        title={title || 'Untitled survey'}
        subtitle="Draft — edit freely, then publish to send it"
        backTo="/surveys"
        backLabel="Surveys"
        actions={
          canManage && (
            <>
              <Button variant="ghost" onClick={() => duplicate.mutate()} disabled={duplicate.isPending || dirty} title={dirty ? 'Save first — a copy uses the saved draft' : undefined}>
                <Copy size={ICON_SIZE.inline} aria-hidden />
                Duplicate
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={ICON_SIZE.inline} aria-hidden />
                Delete
              </Button>
              <Button variant="ghost" onClick={() => save.mutate()} disabled={!dirty || !validation.success || save.isPending}>
                Save
              </Button>
              {onPublish && (
                <Button onClick={onPublish} disabled={!canPublish} title={dirty ? 'Save first' : undefined}>
                  Publish…
                </Button>
              )}
            </>
          )
        }
      />
      <div className="survey-editor">
        <Card>
          <Field label="Title">
            <Input
              aria-label="Survey title"
              value={title}
              maxLength={SURVEY_TITLE_MAX}
              disabled={locked}
              onChange={(e) => touch(() => setTitle(e.target.value))}
            />
          </Field>
          <Field label="Description" hint="Shown to mothers above the questions">
            <Input
              aria-label="Survey description"
              value={description}
              maxLength={SURVEY_DESCRIPTION_MAX}
              disabled={locked}
              onChange={(e) => touch(() => setDescription(e.target.value))}
            />
          </Field>
        </Card>
        {questions.map((q, i) => (
          <QuestionCard
            key={q.key}
            question={q}
            index={i}
            count={questions.length}
            onChange={(next) => updateAt(i, next)}
            onMove={(delta) => move(i, delta)}
            readOnly={locked}
            onRemove={() => touch(() => setQuestions((qs) => qs.filter((_, j) => j !== i)))}
          />
        ))}
        {canManage && questions.length < SURVEY_MAX_QUESTIONS && (
          <div>
            <Button
              variant="ghost"
              disabled={locked}
              onClick={() =>
                touch(() => setQuestions((qs) => [...qs, { key: newKey(), type: 'TEXT', prompt: '', required: true, options: [] }]))
              }
            >
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add question
            </Button>
          </div>
        )}
        {dirty && problem && (
          <p role="alert" className="survey-editor-problem">
            {problem}
          </p>
        )}
      </div>
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your changes to this draft will be lost."
          confirmLabel="Leave"
          cancelLabel="Stay"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
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
