import type { AdminSurvey, AdminSurveyRecipient, SurveyAnswer, SurveyQuestion } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { Badge, ErrorState, LoadingState, Modal } from '@admin/components/ui';
import { fetchSurveyRecipientAnswers } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime } from '@admin/lib/format';

import { RECIPIENT_STATUS_LABEL, RECIPIENT_STATUS_TONE } from './survey-labels';

function formatAnswer(q: SurveyQuestion, a: SurveyAnswer | undefined): string {
  if (!a) return '—';
  if (a.text !== null) return a.text;
  if (a.rating !== null) return `${a.rating} / 5`;
  if (a.bool !== null) return a.bool ? 'Yes' : 'No';
  const labels = q.options.filter((o) => a.optionIds.includes(o.id)).map((o) => o.label);
  return labels.length ? labels.join(', ') : '—';
}

/** Matches the badge above it: skipped is not "not yet". */
function statusLine(r: AdminSurveyRecipient): string {
  if (r.status === 'ANSWERED') return r.answeredAt ? `Answered on ${formatDateTime(r.answeredAt)}.` : 'Answered.';
  if (r.status === 'SKIPPED') {
    return r.skippedAt ? `She skipped this survey on ${formatDateTime(r.skippedAt)}.` : 'She skipped this survey.';
  }
  return `No response yet. Last sent ${formatDateTime(r.lastSentAt)}.`;
}

type Props = { survey: AdminSurvey; userId: number; onClose: () => void };

/** One mother's status and, once she has answered, her answer to every question. */
export function RecipientAnswersModal({ survey, userId, onClose }: Props) {
  const query = useQuery({
    queryKey: ['surveys', survey.id, 'recipients', userId],
    queryFn: () => fetchSurveyRecipientAnswers(survey.id, userId),
  });
  return (
    <Modal title={query.data?.recipient.name ?? 'Answers'} onClose={onClose}>
      {query.isPending ? (
        <LoadingState label="Loading answers…" />
      ) : query.isError ? (
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      ) : (
        <>
          <Badge tone={RECIPIENT_STATUS_TONE[query.data.recipient.status]}>
            {RECIPIENT_STATUS_LABEL[query.data.recipient.status]}
          </Badge>
          <p className="modal-text answer-status">{statusLine(query.data.recipient)}</p>
          {query.data.recipient.status === 'ANSWERED' && (
            <dl className="answer-list">
              {survey.questions.map((q) => (
                <div key={q.id} className="answer-item">
                  {/* A prompt is a sentence: regular case and weight, not a field label. */}
                  <dt className="answer-prompt">{q.prompt}</dt>
                  <dd className="answer-value">
                    {formatAnswer(q, query.data.answers.find((a) => a.questionId === q.id))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </Modal>
  );
}
