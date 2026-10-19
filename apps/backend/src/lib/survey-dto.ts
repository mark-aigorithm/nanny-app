import type { Prisma, SurveyQuestionType } from '@prisma/client';

import type { SurveyCounts, SurveyDraft, SurveyQuestion } from '@nanny-app/shared';

/** Live questions in order, each with its live options in order. */
export const surveyQuestionsInclude = {
  questions: {
    where: { deletedAt: null },
    orderBy: { order: 'asc' },
    include: { options: { where: { deletedAt: null }, orderBy: { order: 'asc' } } },
  },
} satisfies Prisma.SurveyInclude;

export type SurveyWithQuestions = Prisma.SurveyGetPayload<{ include: typeof surveyQuestionsInclude }>;
type QuestionRow = SurveyWithQuestions['questions'][number];

export function toQuestionDto(row: QuestionRow): SurveyQuestion {
  return {
    id: row.id,
    order: row.order,
    type: row.type,
    prompt: row.prompt,
    required: row.required,
    options: row.options.map((o) => ({ id: o.id, order: o.order, label: o.label })),
  };
}

/** Nested-create rows for a draft's questions, numbered in the order given. */
export function questionCreateData(
  questions: SurveyDraft['questions'],
): Prisma.SurveyQuestionCreateWithoutSurveyInput[] {
  return questions.map((q, order) => ({
    order,
    type: q.type as SurveyQuestionType,
    prompt: q.prompt,
    required: q.required,
    options: { create: q.options.map((label, i) => ({ order: i, label })) },
  }));
}

export const EMPTY_COUNTS: SurveyCounts = { recipients: 0, answered: 0, skipped: 0, pending: 0 };
