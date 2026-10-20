import type { AdminSurvey, SurveyDraftInput } from '@nanny-app/shared';
import {
  SURVEY_DESCRIPTION_MAX,
  SURVEY_MAX_QUESTIONS,
  SURVEY_TITLE_MAX,
  SurveyDraftSchema,
} from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  ConfirmDialog,
  DetailHeader,
  Field,
  ICON_SIZE,
  Input,
  Plus,
  Send,
  useToast,
} from '@admin/components/ui';
import { createSurvey, updateSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { draftIssues } from './draft-issues';
import { QuestionCard, type DraftQuestion } from './question-card';
import { SurveyPreview } from './survey-preview';

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
  /** Back to the draft's view, after a Save or on Cancel; `publish` opens its publish flow. */
  onDone?: (then?: 'publish') => void;
  /**
   * A survey not created yet (/surveys/new): the first Save creates it and
   * opens it at its own URL, so an abandoned "New survey" leaves nothing.
   */
  isNew?: boolean;
};

/**
 * The draft editor: title, description and questions, saved in one PATCH, with
 * a live preview beside it. Publishing happens from the draft's view.
 */
export function SurveyEditor({ survey, onDone, isNew = false }: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('surveys');
  const [title, setTitle] = useState(survey.title);
  const [description, setDescription] = useState(survey.description ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => toDraftQuestions(survey));
  const [dirty, setDirty] = useState(false);
  // Index of a question with content awaiting "Delete question N?".
  const [removingAt, setRemovingAt] = useState<number | null>(null);
  // Field problems show only after a Save was tried, not while still typing.
  const [attempted, setAttempted] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const focusFirstProblem = useRef(false);
  // Set just before the editor leaves on purpose (a successful Save), so the
  // unsaved-changes guard lets that one through.
  const leavingOnPurpose = useRef(false);

  // Unsaved edits: ask before an in-app navigation (Cancel back to the view
  // included), and let the browser ask before the tab closes or reloads.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !leavingOnPurpose.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
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
      questions: questions.map(({ type, prompt, required, options }) => ({
        type,
        prompt,
        required,
        options,
      })),
    }),
    [title, description, questions],
  );
  const validation = useMemo(() => SurveyDraftSchema.safeParse(draft), [draft]);
  const issues = useMemo(
    () => draftIssues(validation.success ? undefined : validation.error),
    [validation],
  );
  const shownIssues = attempted ? issues : draftIssues(undefined);
  useEffect(() => {
    if (!focusFirstProblem.current) return;
    focusFirstProblem.current = false;
    editorRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  });

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

  // `publish`: Save and publish — once saved, the draft opens on its publish flow.
  const save = useMutation({
    mutationFn: (_then: { publish: boolean }) =>
      isNew ? createSurvey(draft) : updateSurvey(survey.id, draft),
    onSuccess: (saved, { publish }) => {
      queryClient.setQueryData(['surveys', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      setDirty(false);
      toast.success('Draft saved');
      leavingOnPurpose.current = true;
      if (isNew) navigate(`/surveys/${saved.id}${publish ? '?publish=1' : ''}`, { replace: true });
      else done(publish ? 'publish' : undefined);
    },
    onError: (err) => toast.error('Couldn’t save the draft', apiErrorMessage(err)),
  });
  // Cancel and a successful Save both lead back; the guard asks first if edits would be lost.
  const done = (then?: 'publish') => (onDone && !isNew ? onDone(then) : navigate('/surveys'));

  // Inputs lock while a save is in flight so an edit can't be marked saved by its response.
  const locked = !canManage || save.isPending;
  // A new survey has nothing on the server yet, so it always has something to save.
  const unsaved = dirty || isNew;

  const trySave = (publish: boolean) => {
    if (save.isPending) return;
    if (validation.success) {
      save.mutate({ publish });
      return;
    }
    setAttempted(true);
    focusFirstProblem.current = true;
  };
  const removeAt = (i: number) => {
    setRemovingAt(null);
    touch(() => setQuestions((qs) => qs.filter((_, j) => j !== i)));
  };
  // A question with words in it is work; an untouched one goes without asking.
  const requestRemove = (i: number) => {
    const q = questions[i];
    const hasContent =
      q !== undefined && (q.prompt.trim() !== '' || q.options.some((o) => o.trim() !== ''));
    if (hasContent) setRemovingAt(i);
    else removeAt(i);
  };

  // Why Save is (or isn't) available, on screen rather than in a tooltip.
  const firstProblem = issues.summary[0];
  const status =
    attempted && firstProblem
      ? `${firstProblem}${issues.summary.length > 1 ? ` (${issues.summary.length - 1} more to fix)` : ''}`
      : isNew && !dirty
        ? 'Not saved yet. Save to create the draft.'
        : !dirty
          ? 'No changes yet.'
          : 'Unsaved changes.';

  return (
    <section>
      <DetailHeader
        // The saved title, not the field being typed in.
        title={isNew ? 'Create new survey' : survey.title}
        subtitle={
          isNew
            ? 'Write the questions, then save it as a draft, or save and publish it now.'
            : 'Editing. Save takes you back to the draft; Save and publish then asks who gets it.'
        }
        backTo="/surveys"
        backLabel="Surveys"
      />
      <div className="template-editor">
        <div className="survey-editor" ref={editorRef}>
          <Card>
            <Field label="Title">
              <Input
                aria-label="Survey title"
                aria-invalid={shownIssues.title ? true : undefined}
                placeholder="e.g. Care feedback"
                value={title}
                maxLength={SURVEY_TITLE_MAX}
                disabled={locked}
                onChange={(e) => touch(() => setTitle(e.target.value))}
              />
            </Field>
            <Field label="Description" hint="Optional. Shown to mothers above the questions.">
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
              issues={shownIssues.questions.get(i)}
              onRemove={() => requestRemove(i)}
            />
          ))}
          {canManage && questions.length < SURVEY_MAX_QUESTIONS && (
            <div>
              <Button
                variant="ghost"
                disabled={locked}
                onClick={() =>
                  touch(() =>
                    setQuestions((qs) => [
                      ...qs,
                      { key: newKey(), type: 'TEXT', prompt: '', required: true, options: [] },
                    ]),
                  )
                }
              >
                <Plus size={ICON_SIZE.inline} aria-hidden />
                Add question
              </Button>
            </div>
          )}
        </div>
        <div className="template-editor-aside">
          <SurveyPreview title={title} description={description} questions={questions} />
          {canManage && (
            <div className="editor-save-panel">
              <p
                role="status"
                className={`editor-save-status${attempted && firstProblem ? ' editor-save-status--problem' : ''}`}
              >
                {status}
              </p>
              <Button
                className="editor-save-primary"
                onClick={() => trySave(true)}
                disabled={!unsaved || save.isPending || questions.length === 0}
              >
                <Send size={ICON_SIZE.inline} aria-hidden />
                {save.isPending && save.variables?.publish ? 'Saving…' : 'Save and publish'}
              </Button>
              <div className="editor-save-secondary">
                <Button
                  variant="ghost"
                  onClick={() => trySave(false)}
                  disabled={!unsaved || save.isPending}
                >
                  {save.isPending && !save.variables?.publish ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="ghost" onClick={() => done()} disabled={save.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
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
      {removingAt !== null && (
        <ConfirmDialog
          title={`Delete question ${removingAt + 1}?`}
          message="Its text and options go with it. Until you save, leaving without saving brings it back."
          confirmLabel="Delete question"
          danger
          onConfirm={() => removeAt(removingAt)}
          onCancel={() => setRemovingAt(null)}
        />
      )}
    </section>
  );
}
