import type { AdminSurvey, SurveyQuestionResult } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Card, ErrorState, LoadingState, Pagination } from '@admin/components/ui';
import { fetchSurveyResults, fetchSurveyTextAnswers } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime } from '@admin/lib/format';

import { QUESTION_TYPE_LABEL } from './survey-labels';

const TEXT_PAGE_SIZE = 20;

/**
 * One question's spread as text rows: label, a bar, and "count · share". The
 * numbers are on screen (and read by screen readers), not in a hover tooltip,
 * and a long option label wraps in its own column instead of colliding.
 * `total` is the share's base — the mothers who answered the question.
 */
function Bars({ label, data, total }: { label: string; data: { label: string; count: number }[]; total: number }) {
  return (
    <ul className="result-bars" aria-label={label}>
      {data.map((d) => {
        const share = total > 0 ? Math.round((d.count / total) * 100) : 0;
        return (
          <li key={d.label} className="result-bar">
            <span className="result-bar-label">{d.label}</span>
            <span className="result-bar-track" aria-hidden>
              {/* Inline width: the one computed value, per the styling rules. */}
              <span className="result-bar-fill" style={{ width: `${share}%` }} />
            </span>
            <span className="result-bar-value">
              {d.count} · {share}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TextAnswers({ surveyId, questionId }: { surveyId: number; questionId: number }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['surveys', surveyId, 'text', questionId, page],
    queryFn: () => fetchSurveyTextAnswers(surveyId, questionId, page, TEXT_PAGE_SIZE),
  });
  if (query.isPending) return <LoadingState label="Loading answers…" />;
  if (query.isError) {
    return <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  if (query.data.data.length === 0) return <p className="survey-result-meta">No written answers yet.</p>;
  return (
    <>
      <ul className="text-answers">
        {query.data.data.map((a) => (
          <li key={`${a.userId}-${a.answeredAt}`}>
            <p>{a.text}</p>
            <span className="survey-result-meta">
              {a.name} · {formatDateTime(a.answeredAt)}
            </span>
          </li>
        ))}
      </ul>
      {query.data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={query.data.meta.totalPages}
          total={query.data.meta.total}
          limit={TEXT_PAGE_SIZE}
          onPageChange={setPage}
          limitOptions={[TEXT_PAGE_SIZE]}
          onLimitChange={() => undefined}
          label="answers"
        />
      )}
    </>
  );
}

function QuestionResult({ surveyId, q }: { surveyId: number; q: SurveyQuestionResult }) {
  return (
    <Card title={`${q.order + 1}. ${q.prompt}`} className="survey-result">
      <p className="survey-result-meta">
        {QUESTION_TYPE_LABEL[q.type]} · {q.answeredCount} answered{q.required ? '' : ' · optional'}
      </p>
      {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE') && (
        <Bars
          label={q.prompt}
          total={q.answeredCount}
          data={q.options.map((o) => ({ label: o.label, count: o.count }))}
        />
      )}
      {q.type === 'YES_NO' && (
        <>
          <p>Yes {q.yesCount ?? 0} · No {q.noCount ?? 0}</p>
          <Bars
            label={q.prompt}
            total={q.answeredCount}
            data={[
              { label: 'Yes', count: q.yesCount ?? 0 },
              { label: 'No', count: q.noCount ?? 0 },
            ]}
          />
        </>
      )}
      {q.type === 'RATING' && (
        <>
          <p>{q.ratingAverage === null ? 'No ratings yet' : `Average ${q.ratingAverage.toFixed(1)} / 5`}</p>
          <Bars
            label={q.prompt}
            total={q.answeredCount}
            data={(q.ratingCounts ?? []).map((count, i) => ({ label: `${i + 1} ★`, count }))}
          />
        </>
      )}
      {q.type === 'TEXT' && <TextAnswers surveyId={surveyId} questionId={q.questionId} />}
    </Card>
  );
}

/** Per-question results: option bars, yes/no split, rating spread and average, paged written answers. */
export function SurveyResults({ survey }: { survey: AdminSurvey }) {
  const query = useQuery({ queryKey: ['surveys', survey.id, 'results'], queryFn: () => fetchSurveyResults(survey.id) });
  if (query.isPending) return <LoadingState label="Loading results…" />;
  if (query.isError) {
    return <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }
  return (
    <div className="survey-results">
      {query.data.questions.map((q) => (
        <QuestionResult key={q.questionId} surveyId={survey.id} q={q} />
      ))}
    </div>
  );
}
