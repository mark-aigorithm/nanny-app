import type { Prisma } from '@prisma/client';

import type {
  AdminSurveyRecipient,
  AdminSurveyRecipientAnswers,
  AdminSurveyRecipientListQuery,
  PaginationMeta,
  SurveyQuestionResult,
  SurveyResults,
  SurveyTextAnswer,
  SurveyTextAnswerQuery,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { displayName } from '@backend/lib/display-name';
import { EMPTY_COUNTS } from '@backend/lib/survey-dto';
import { countedRecipient, requireSurvey, surveyCounts } from '@backend/services/admin-survey.service';

const meta = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

export async function getSurveyResults(id: number): Promise<SurveyResults> {
  const survey = await requireSurvey(id);
  const live = { deletedAt: null, question: { surveyId: id } };

  const [answered, ratings, bools, picks, counts] = await Promise.all([
    prisma.surveyAnswer.groupBy({ by: ['questionId'], where: live, _count: { _all: true } }),
    prisma.surveyAnswer.groupBy({
      by: ['questionId', 'ratingValue'],
      where: { ...live, ratingValue: { not: null } },
      _count: { _all: true },
    }),
    prisma.surveyAnswer.groupBy({
      by: ['questionId', 'boolValue'],
      where: { ...live, boolValue: { not: null } },
      _count: { _all: true },
    }),
    prisma.surveyAnswerOption.groupBy({
      by: ['optionId'],
      where: { deletedAt: null, answer: { deletedAt: null, question: { surveyId: id } } },
      _count: { _all: true },
    }),
    surveyCounts([id]),
  ]);

  const answeredBy = new Map(answered.map((g) => [g.questionId, g._count._all]));
  const pickCount = new Map(picks.map((g) => [g.optionId, g._count._all]));

  const questions: SurveyQuestionResult[] = survey.questions.map((q) => {
    const base: SurveyQuestionResult = {
      questionId: q.id,
      order: q.order,
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      answeredCount: answeredBy.get(q.id) ?? 0,
      options: [],
      yesCount: null,
      noCount: null,
      ratingCounts: null,
      ratingAverage: null,
    };
    if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE') {
      base.options = q.options.map((o) => ({ optionId: o.id, label: o.label, count: pickCount.get(o.id) ?? 0 }));
    }
    if (q.type === 'YES_NO') {
      const mine = bools.filter((g) => g.questionId === q.id);
      base.yesCount = mine.find((g) => g.boolValue === true)?._count._all ?? 0;
      base.noCount = mine.find((g) => g.boolValue === false)?._count._all ?? 0;
    }
    if (q.type === 'RATING') {
      const spread = [0, 0, 0, 0, 0];
      for (const g of ratings.filter((r) => r.questionId === q.id)) {
        if (g.ratingValue != null) spread[g.ratingValue - 1] = g._count._all;
      }
      const total = spread.reduce((s, n) => s + n, 0);
      base.ratingCounts = spread;
      base.ratingAverage = total === 0 ? null : spread.reduce((s, n, i) => s + n * (i + 1), 0) / total;
    }
    return base;
  });

  return { surveyId: id, counts: counts.get(id) ?? { ...EMPTY_COUNTS }, questions };
}

export async function listSurveyTextAnswers(
  id: number,
  q: SurveyTextAnswerQuery,
): Promise<{ answers: SurveyTextAnswer[]; meta: PaginationMeta }> {
  await requireSurvey(id);
  const where: Prisma.SurveyAnswerWhereInput = {
    deletedAt: null,
    questionId: q.questionId,
    question: { surveyId: id },
    textValue: { not: null },
  };
  const [total, rows] = await prisma.$transaction([
    prisma.surveyAnswer.count({ where }),
    prisma.surveyAnswer.findMany({
      where,
      include: { recipient: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);
  return {
    answers: rows.map((r) => ({
      userId: r.recipient.user.id,
      name: displayName(r.recipient.user.firstName, r.recipient.user.lastName),
      text: r.textValue ?? '',
      answeredAt: r.createdAt.toISOString(),
    })),
    meta: meta(q.page, q.limit, total),
  };
}

const recipientInclude = {
  user: { select: { id: true, firstName: true, lastName: true, phone: true } },
} as const;

type RecipientRow = Prisma.SurveyRecipientGetPayload<{ include: typeof recipientInclude }>;

function toRecipientDto(r: RecipientRow): AdminSurveyRecipient {
  return {
    userId: r.user.id,
    name: displayName(r.user.firstName, r.user.lastName),
    phone: r.user.phone,
    status: r.status,
    sentCount: r.sentCount,
    lastSentAt: r.lastSentAt.toISOString(),
    skippedAt: r.skippedAt ? r.skippedAt.toISOString() : null,
    answeredAt: r.answeredAt ? r.answeredAt.toISOString() : null,
  };
}

function recipientOrderBy(q: AdminSurveyRecipientListQuery): Prisma.SurveyRecipientOrderByWithRelationInput[] {
  const dir = q.sortDir;
  switch (q.sortBy) {
    case 'name':
      return [{ user: { firstName: dir } }, { user: { lastName: dir } }];
    case 'status':
      return [{ status: dir }];
    case 'sentCount':
      return [{ sentCount: dir }];
    case 'answeredAt':
      return [{ answeredAt: { sort: dir, nulls: 'last' } }];
    case 'lastSentAt':
      return [{ lastSentAt: dir }];
  }
}

export async function listSurveyRecipients(
  id: number,
  q: AdminSurveyRecipientListQuery,
): Promise<{ recipients: AdminSurveyRecipient[]; meta: PaginationMeta }> {
  await requireSurvey(id);
  // Same rows as the counts on the tabs above the list.
  const where: Prisma.SurveyRecipientWhereInput = {
    surveyId: id,
    deletedAt: null,
    ...countedRecipient,
    ...(q.status ? { status: q.status } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.surveyRecipient.count({ where }),
    prisma.surveyRecipient.findMany({
      where,
      include: recipientInclude,
      orderBy: [...recipientOrderBy(q), { id: 'asc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);
  return { recipients: rows.map(toRecipientDto), meta: meta(q.page, q.limit, total) };
}

export async function getSurveyRecipientAnswers(id: number, userId: number): Promise<AdminSurveyRecipientAnswers> {
  await requireSurvey(id);
  const row = await prisma.surveyRecipient.findFirst({
    where: { surveyId: id, userId, deletedAt: null },
    include: {
      ...recipientInclude,
      answers: { where: { deletedAt: null }, include: { options: { where: { deletedAt: null } } } },
    },
  });
  if (!row) throw errors.notFound('This mother was not sent this survey.');
  return {
    recipient: toRecipientDto(row),
    answers: row.answers.map((a) => ({
      questionId: a.questionId,
      text: a.textValue,
      rating: a.ratingValue,
      bool: a.boolValue,
      optionIds: a.options.map((o) => o.optionId),
    })),
  };
}
