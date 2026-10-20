import type { SurveyQuestionType } from '@nanny-app/shared';
import { SURVEY_MAX_OPTIONS, SURVEY_OPTION_MAX, SURVEY_PROMPT_MAX, isChoiceQuestion } from '@nanny-app/shared';
import { useEffect, useId, useRef } from 'react';

import { ArrowDown, ArrowUp, Button, Field, ICON_SIZE, Input, Plus, Select, Trash2 } from '@admin/components/ui';

import type { QuestionIssues } from './draft-issues';
import { QUESTION_TYPE_LABEL } from './survey-labels';

export type DraftQuestion = {
  /** Client-only identity for React keys; never sent. */
  key: string;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  options: string[];
};

type Props = {
  question: DraftQuestion;
  index: number;
  count: number;
  onChange: (next: DraftQuestion) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  /** Disables every control (view-only operator, or a save in flight). */
  readOnly?: boolean;
  /** Problems to mark on the fields — passed only once a save has been tried. */
  issues?: QuestionIssues;
};

const TYPE_OPTIONS = (Object.keys(QUESTION_TYPE_LABEL) as SurveyQuestionType[]).map((value) => ({
  value,
  label: QUESTION_TYPE_LABEL[value],
}));

/** One question of a draft: prompt, answer type, options (choice types) and Required. */
export function QuestionCard({ question, index, count, onChange, onMove, onRemove, readOnly = false, issues }: Props) {
  const promptErrorId = useId();
  const optionsErrorId = useId();
  const setType = (type: SurveyQuestionType) =>
    onChange({
      ...question,
      type,
      // Switching to a choice type starts with two empty options; away from one drops them.
      options: isChoiceQuestion(type) ? (question.options.length >= 2 ? question.options : ['', '']) : [],
    });
  // After a move the card re-renders at its new index; keep focus on the
  // button that moved it, or its sibling if that one is now disabled.
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  const moved = useRef<'up' | 'down' | null>(null);
  useEffect(() => {
    const dir = moved.current;
    if (!dir) return;
    moved.current = null;
    const [same, other] = dir === 'up' ? [upRef.current, downRef.current] : [downRef.current, upRef.current];
    (same && !same.disabled ? same : other)?.focus();
  }, [index]);
  const move = (dir: 'up' | 'down') => {
    moved.current = dir;
    onMove(dir === 'up' ? -1 : 1);
  };
  const setOption = (i: number, label: string) =>
    onChange({ ...question, options: question.options.map((o, j) => (j === i ? label : o)) });

  return (
    <fieldset className="question-card" aria-label={`Question ${index + 1}`}>
      <legend className="question-card-legend">Question {index + 1}</legend>
      <div className="question-card-main">
        <Field label="Question">
          <Input
            aria-label="Question"
            aria-invalid={issues?.prompt ? true : undefined}
            aria-describedby={issues?.prompt ? promptErrorId : undefined}
            value={question.prompt}
            maxLength={SURVEY_PROMPT_MAX}
            disabled={readOnly}
            onChange={(e) => onChange({ ...question, prompt: e.target.value })}
          />
          {issues?.prompt && (
            <span id={promptErrorId} className="field-error">
              {issues.prompt}
            </span>
          )}
        </Field>
        <div className="field">
          <span className="field-label">Answer type</span>
          <Select aria-label="Answer type" value={question.type} options={TYPE_OPTIONS} onChange={setType} disabled={readOnly} />
        </div>
      </div>
      {isChoiceQuestion(question.type) && (
        <div className="question-options">
          {question.options.map((label, i) => (
            <div key={i} className="question-option">
              <Input
                aria-label={`Option ${i + 1}`}
                aria-invalid={issues?.badOptions.includes(i) ? true : undefined}
                aria-describedby={issues?.options ? optionsErrorId : undefined}
                placeholder={`Option ${i + 1}`}
                value={label}
                maxLength={SURVEY_OPTION_MAX}
                disabled={readOnly}
                onChange={(e) => setOption(i, e.target.value)}
              />
              {question.options.length > 2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readOnly}
                  aria-label={`Remove option ${i + 1}`}
                  onClick={() => onChange({ ...question, options: question.options.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={ICON_SIZE.inline} aria-hidden />
                </Button>
              )}
            </div>
          ))}
          {issues?.options && (
            <span id={optionsErrorId} className="field-error">
              {issues.options}
            </span>
          )}
          {question.options.length < SURVEY_MAX_OPTIONS && (
            <div>
              <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => onChange({ ...question, options: [...question.options, ''] })}>
                <Plus size={ICON_SIZE.inline} aria-hidden />
                Add option
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="question-card-footer">
        <label className="question-required">
          <input
            type="checkbox"
            checked={question.required}
            disabled={readOnly}
            onChange={(e) => onChange({ ...question, required: e.target.checked })}
          />
          Required
        </label>
        <div className="question-actions">
          <Button
            ref={upRef}
            variant="ghost"
            size="sm"
            aria-label={`Move question ${index + 1} up`}
            disabled={readOnly || index === 0}
            onClick={() => move('up')}
          >
            <ArrowUp size={ICON_SIZE.inline} aria-hidden />
          </Button>
          <Button
            ref={downRef}
            variant="ghost"
            size="sm"
            aria-label={`Move question ${index + 1} down`}
            disabled={readOnly || index === count - 1}
            onClick={() => move('down')}
          >
            <ArrowDown size={ICON_SIZE.inline} aria-hidden />
          </Button>
          <Button variant="danger" size="sm" disabled={readOnly} onClick={onRemove}>
            <Trash2 size={ICON_SIZE.inline} aria-hidden />
            Delete question
          </Button>
        </div>
      </div>
    </fieldset>
  );
}
