import type { SurveyCounts, SurveyQuestionType, SurveyRecipientStatus, SurveyStatus } from '@nanny-app/shared';

type Tone = 'neutral' | 'success' | 'danger' | 'warning';

export const SURVEY_STATUS_LABEL: Record<SurveyStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  CLOSED: 'Closed',
};
export const SURVEY_STATUS_TONE: Record<SurveyStatus, Tone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  CLOSED: 'warning',
};

export const RECIPIENT_STATUS_LABEL: Record<SurveyRecipientStatus, string> = {
  PENDING: 'No response',
  SKIPPED: 'Skipped',
  ANSWERED: 'Answered',
};
export const RECIPIENT_STATUS_TONE: Record<SurveyRecipientStatus, Tone> = {
  PENDING: 'neutral',
  SKIPPED: 'warning',
  ANSWERED: 'success',
};

export const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  TEXT: 'Free text',
  SINGLE_CHOICE: 'Single choice',
  MULTI_CHOICE: 'Multiple choice',
  RATING: 'Rating 1–5',
  YES_NO: 'Yes / No',
};

/** Answered share of everyone the survey was sent to; '—' before it is sent. */
export function responseRate(counts: SurveyCounts): string {
  if (counts.recipients === 0) return '—';
  return `${Math.round((counts.answered / counts.recipients) * 100)}%`;
}
