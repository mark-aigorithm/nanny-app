import type { SurveyQuestionType } from '@nanny-app/shared';

import { Star } from '@admin/components/ui';

export type PreviewQuestion = {
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  options: string[];
};

type SurveyPreviewProps = {
  title: string;
  questions: PreviewQuestion[];
  /** The draft's own screen, where the preview is the page; otherwise the editor's side column. */
  wide?: boolean;
};

/**
 * The survey as a mother sees it in the app: its title, then each question
 * on its own card ("Question 2 of 5", Optional where it is) with its answer control (a text box, choices, stars or Yes/No).
 * A decorative copy, so nothing in it can be answered.
 */
export function SurveyPreview({ title, questions, wide = false }: SurveyPreviewProps) {
  const shownTitle = title.trim() || 'Your survey title';
  return (
    <aside className={`survey-preview${wide ? ' survey-preview--wide' : ''}`} aria-label="Preview">
      <h3 className="notif-preview-heading">Preview</h3>
      <div className="survey-preview-screen">
        <p className={`survey-preview-title${title.trim() ? '' : ' notif-placeholder'}`} dir="auto">
          {shownTitle}
        </p>
        {questions.length === 0 ? (
          <p className="survey-preview-empty">No questions yet.</p>
        ) : (
          <ol className="survey-preview-questions">
            {questions.map((q, i) => (
              <li key={i} className="survey-preview-question">
                <div className="survey-preview-meta">
                  <span>
                    Question {i + 1} of {questions.length}
                  </span>
                  {!q.required && <span className="survey-preview-optional">Optional</span>}
                </div>
                <p className="survey-preview-prompt" dir="auto">
                  <span className={q.prompt.trim() ? undefined : 'notif-placeholder'}>
                    {q.prompt.trim() || 'Your question'}
                  </span>
                </p>
                <AnswerControl question={q} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}

/** The control the app shows for a question type, drawn rather than interactive. */
function AnswerControl({ question }: { question: PreviewQuestion }) {
  switch (question.type) {
    case 'TEXT':
      return <div className="survey-preview-textbox">Type your answer</div>;
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE': {
      const options = question.options.filter((o) => o.trim());
      const mark =
        question.type === 'SINGLE_CHOICE' ? 'survey-preview-radio' : 'survey-preview-check';
      return (
        <ul className="survey-preview-options">
          {(options.length ? options : ['Option 1', 'Option 2']).map((option, i) => (
            <li key={i} className={options.length ? undefined : 'notif-placeholder'}>
              <span className={mark} aria-hidden />
              <span dir="auto">{option}</span>
            </li>
          ))}
        </ul>
      );
    }
    case 'RATING':
      return (
        <div className="survey-preview-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={22} aria-hidden />
          ))}
        </div>
      );
    case 'YES_NO':
      return (
        <div className="survey-preview-yesno">
          <span>Yes</span>
          <span>No</span>
        </div>
      );
  }
}
