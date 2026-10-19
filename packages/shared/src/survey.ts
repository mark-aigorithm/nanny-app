import { z } from 'zod';

import { AdminListQuerySchema, AdminSortDirSchema } from './admin';

// ──────────────────────────────────────────────────────────────
// Surveys — admin-written questionnaires sent to mothers. A survey is
// edited as a DRAFT, locked when PUBLISHED, and CLOSED to stop answers.
// Each mother it was sent to has one recipient row (PENDING / SKIPPED /
// ANSWERED) and, once she submits, one answer per question.
// ──────────────────────────────────────────────────────────────

export const SURVEY_TITLE_MAX = 120;
export const SURVEY_DESCRIPTION_MAX = 500;
export const SURVEY_PROMPT_MAX = 300;
export const SURVEY_OPTION_MAX = 120;
export const SURVEY_TEXT_ANSWER_MAX = 2000;
export const SURVEY_MAX_QUESTIONS = 30;
export const SURVEY_MAX_OPTIONS = 10;
/** Upper bound on one targeting / resend call, so a body can't be unbounded. */
export const SURVEY_MAX_USER_IDS = 5000;

export const SurveyStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']);
export type SurveyStatus = z.infer<typeof SurveyStatusSchema>;

export const SurveyQuestionTypeSchema = z.enum(['TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'RATING', 'YES_NO']);
export type SurveyQuestionType = z.infer<typeof SurveyQuestionTypeSchema>;

export const SurveyRecipientStatusSchema = z.enum(['PENDING', 'SKIPPED', 'ANSWERED']);
export type SurveyRecipientStatus = z.infer<typeof SurveyRecipientStatusSchema>;

export function isChoiceQuestion(type: SurveyQuestionType): boolean {
  return type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE';
}

/** Blank strings are stored as null rather than as ''. */
const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

// ── Draft editing (admin) ──────────────────────────────────────

export const SurveyQuestionDraftSchema = z
  .object({
    type: SurveyQuestionTypeSchema,
    prompt: z.string().trim().min(1).max(SURVEY_PROMPT_MAX),
    required: z.boolean().default(true),
    options: z.array(z.string().trim().min(1).max(SURVEY_OPTION_MAX)).max(SURVEY_MAX_OPTIONS).default([]),
  })
  .superRefine((q, ctx) => {
    if (isChoiceQuestion(q.type)) {
      if (q.options.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'A choice question needs at least 2 options.' });
      }
      if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different from each other.' });
      }
    } else if (q.options.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Only choice questions have options.' });
    }
  });

/** Create and PATCH both send the whole draft; PATCH replaces every question. */
export const SurveyDraftSchema = z.object({
  title: z.string().trim().min(1).max(SURVEY_TITLE_MAX),
  description: optionalText(SURVEY_DESCRIPTION_MAX),
  questions: z.array(SurveyQuestionDraftSchema).max(SURVEY_MAX_QUESTIONS).default([]),
});
export type SurveyDraftInput = z.input<typeof SurveyDraftSchema>;
export type SurveyDraft = z.output<typeof SurveyDraftSchema>;

// ── Sending ────────────────────────────────────────────────────

const UserIdListSchema = z.array(z.number().int().positive()).max(SURVEY_MAX_USER_IDS);

/** Who a publish / "add recipients" reaches. The three are unioned and deduplicated. */
export const SurveyTargetSchema = z
  .object({
    allMothers: z.boolean().default(false),
    groupIds: z.array(z.number().int().positive()).max(100).default([]),
    userIds: UserIdListSchema.default([]),
  })
  .refine((t) => t.allMothers || t.groupIds.length > 0 || t.userIds.length > 0, {
    message: 'Choose who to send the survey to.',
  });
export type SurveyTargetInput = z.input<typeof SurveyTargetSchema>;
export type SurveyTarget = z.output<typeof SurveyTargetSchema>;

/** Resend to chosen mothers, or to everyone who skipped / never responded. */
export const SurveyResendSchema = z.union([
  z.object({ userIds: UserIdListSchema.min(1) }).strict(),
  z.object({ status: z.enum(['SKIPPED', 'PENDING']) }).strict(),
]);
export type SurveyResendInput = z.infer<typeof SurveyResendSchema>;

export const SurveySendResultSchema = z.object({ count: z.number().int() });
export type SurveySendResult = z.infer<typeof SurveySendResultSchema>;

// ── Read models ────────────────────────────────────────────────

export const SurveyOptionSchema = z.object({
  id: z.number().int(),
  order: z.number().int(),
  label: z.string(),
});
export type SurveyOption = z.infer<typeof SurveyOptionSchema>;

export const SurveyQuestionSchema = z.object({
  id: z.number().int(),
  order: z.number().int(),
  type: SurveyQuestionTypeSchema,
  prompt: z.string(),
  required: z.boolean(),
  options: z.array(SurveyOptionSchema),
});
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const SurveyCountsSchema = z.object({
  recipients: z.number().int(),
  answered: z.number().int(),
  skipped: z.number().int(),
  pending: z.number().int(),
});
export type SurveyCounts = z.infer<typeof SurveyCountsSchema>;

export const AdminSurveySummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  status: SurveyStatusSchema,
  counts: SurveyCountsSchema,
  publishedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminSurveySummary = z.infer<typeof AdminSurveySummarySchema>;

export const AdminSurveySchema = AdminSurveySummarySchema.extend({
  description: z.string().nullable(),
  questions: z.array(SurveyQuestionSchema),
});
export type AdminSurvey = z.infer<typeof AdminSurveySchema>;

export const AdminSurveyListQuerySchema = AdminListQuerySchema.extend({
  status: SurveyStatusSchema.optional().catch(undefined),
});
export type AdminSurveyListQuery = z.infer<typeof AdminSurveyListQuerySchema>;

export const ADMIN_SURVEY_RECIPIENT_SORT_KEYS = ['name', 'status', 'sentCount', 'lastSentAt', 'answeredAt'] as const;
export const AdminSurveyRecipientSortKeySchema = z.enum(ADMIN_SURVEY_RECIPIENT_SORT_KEYS);
export type AdminSurveyRecipientSortKey = z.infer<typeof AdminSurveyRecipientSortKeySchema>;

export const AdminSurveyRecipientListQuerySchema = AdminListQuerySchema.extend({
  status: SurveyRecipientStatusSchema.optional().catch(undefined),
  sortBy: AdminSurveyRecipientSortKeySchema.catch('lastSentAt').default('lastSentAt'),
  sortDir: AdminSortDirSchema.catch('desc').default('desc'),
});
export type AdminSurveyRecipientListQuery = z.infer<typeof AdminSurveyRecipientListQuerySchema>;

export const AdminSurveyRecipientSchema = z.object({
  userId: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  status: SurveyRecipientStatusSchema,
  sentCount: z.number().int(),
  lastSentAt: z.string(),
  skippedAt: z.string().nullable(),
  answeredAt: z.string().nullable(),
});
export type AdminSurveyRecipient = z.infer<typeof AdminSurveyRecipientSchema>;

/** One stored answer; exactly one value field is set, matching the question's type. */
export const SurveyAnswerSchema = z.object({
  questionId: z.number().int(),
  text: z.string().nullable(),
  rating: z.number().int().nullable(),
  bool: z.boolean().nullable(),
  optionIds: z.array(z.number().int()),
});
export type SurveyAnswer = z.infer<typeof SurveyAnswerSchema>;

export const AdminSurveyRecipientAnswersSchema = z.object({
  recipient: AdminSurveyRecipientSchema,
  answers: z.array(SurveyAnswerSchema),
});
export type AdminSurveyRecipientAnswers = z.infer<typeof AdminSurveyRecipientAnswersSchema>;

// ── Results ────────────────────────────────────────────────────

export const SurveyOptionResultSchema = z.object({
  optionId: z.number().int(),
  label: z.string(),
  count: z.number().int(),
});
export type SurveyOptionResult = z.infer<typeof SurveyOptionResultSchema>;

export const SurveyQuestionResultSchema = z.object({
  questionId: z.number().int(),
  order: z.number().int(),
  type: SurveyQuestionTypeSchema,
  prompt: z.string(),
  required: z.boolean(),
  /** Mothers who gave this question a value. */
  answeredCount: z.number().int(),
  /** Choice questions only; [] otherwise. */
  options: z.array(SurveyOptionResultSchema),
  /** YES_NO only. */
  yesCount: z.number().int().nullable(),
  noCount: z.number().int().nullable(),
  /** RATING only: counts for ratings 1..5 (index 0 = rating 1). */
  ratingCounts: z.array(z.number().int()).nullable(),
  ratingAverage: z.number().nullable(),
});
export type SurveyQuestionResult = z.infer<typeof SurveyQuestionResultSchema>;

export const SurveyResultsSchema = z.object({
  surveyId: z.number().int(),
  counts: SurveyCountsSchema,
  questions: z.array(SurveyQuestionResultSchema),
});
export type SurveyResults = z.infer<typeof SurveyResultsSchema>;

export const SurveyTextAnswerQuerySchema = AdminListQuerySchema.extend({
  questionId: z.coerce.number().int().positive(),
});
export type SurveyTextAnswerQuery = z.infer<typeof SurveyTextAnswerQuerySchema>;

export const SurveyTextAnswerSchema = z.object({
  userId: z.number().int(),
  name: z.string(),
  text: z.string(),
  answeredAt: z.string(),
});
export type SurveyTextAnswer = z.infer<typeof SurveyTextAnswerSchema>;

// ── Mother side ────────────────────────────────────────────────

export const MotherSurveySummarySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(['PENDING', 'SKIPPED']),
  questionCount: z.number().int(),
  lastSentAt: z.string(),
});
export type MotherSurveySummary = z.infer<typeof MotherSurveySummarySchema>;

export const MotherSurveySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  questions: z.array(SurveyQuestionSchema),
});
export type MotherSurvey = z.infer<typeof MotherSurveySchema>;

export const SurveyAnswerInputSchema = z.object({
  questionId: z.number().int().positive(),
  text: z.string().trim().max(SURVEY_TEXT_ANSWER_MAX).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  bool: z.boolean().optional(),
  optionIds: z.array(z.number().int().positive()).max(SURVEY_MAX_OPTIONS).optional(),
});
export type SurveyAnswerInput = z.infer<typeof SurveyAnswerInputSchema>;

export const SubmitSurveyAnswersSchema = z.object({
  answers: z.array(SurveyAnswerInputSchema).max(SURVEY_MAX_QUESTIONS),
});
export type SubmitSurveyAnswersInput = z.infer<typeof SubmitSurveyAnswersSchema>;

// ── The answer rule — one copy, used by the backend to refuse and the app to enable Submit ──

type ValueField = 'text' | 'rating' | 'bool' | 'optionIds';

function valueFieldFor(type: SurveyQuestionType): ValueField {
  switch (type) {
    case 'TEXT':
      return 'text';
    case 'RATING':
      return 'rating';
    case 'YES_NO':
      return 'bool';
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE':
      return 'optionIds';
  }
}

/** Whether an answer carries a real value for its type. Blank text and no picks are not answers. */
export function hasAnswerValue(type: SurveyQuestionType, answer: SurveyAnswerInput | undefined): boolean {
  if (!answer) return false;
  switch (valueFieldFor(type)) {
    case 'text':
      return (answer.text?.trim().length ?? 0) > 0;
    case 'rating':
      return answer.rating !== undefined;
    case 'bool':
      return answer.bool !== undefined;
    case 'optionIds':
      return (answer.optionIds?.length ?? 0) > 0;
  }
}

type QuestionForCheck = Pick<SurveyQuestion, 'id' | 'type' | 'prompt' | 'required'> & {
  options: Pick<SurveyOption, 'id'>[];
};

/** Why a submission can't be accepted, or null when it can. */
export function findSurveyAnswerProblem(
  questions: QuestionForCheck[],
  answers: SurveyAnswerInput[],
): string | null {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<number>();

  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) return 'An answer refers to a question that is not in this survey.';
    if (seen.has(answer.questionId)) return 'A question was answered twice.';
    seen.add(answer.questionId);

    const given = (['text', 'rating', 'bool', 'optionIds'] as const).filter((f) => answer[f] !== undefined);
    const expected = valueFieldFor(question.type);
    if (given.length > 1 || (given.length === 1 && given[0] !== expected)) {
      return `"${question.prompt}" got the wrong kind of answer.`;
    }

    if (answer.optionIds) {
      const valid = new Set(question.options.map((o) => o.id));
      if (answer.optionIds.some((id) => !valid.has(id))) {
        return `"${question.prompt}" has an option that doesn't belong to it.`;
      }
      if (new Set(answer.optionIds).size !== answer.optionIds.length) {
        return `"${question.prompt}" has an option picked more than once.`;
      }
      if (question.type === 'SINGLE_CHOICE' && answer.optionIds.length > 1) {
        return `Pick one option for "${question.prompt}".`;
      }
    }
  }

  for (const question of questions) {
    if (!question.required) continue;
    const answer = answers.find((a) => a.questionId === question.id);
    if (!hasAnswerValue(question.type, answer)) return `"${question.prompt}" is required.`;
  }
  return null;
}
