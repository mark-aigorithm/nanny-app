import { SurveyStatus } from '@prisma/client';

import type {
  AdminSurvey,
  AdminSurveyListQuery,
  AdminSurveySummary,
  PaginationMeta,
  SurveyCounts,
  SurveyDraft,
  SurveySendResult,
  SurveyTarget,
} from '@nanny-app/shared';
import { SURVEY_TITLE_MAX } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  EMPTY_COUNTS,
  questionCreateData,
  surveyQuestionsInclude,
  toQuestionDto,
  type SurveyWithQuestions,
} from '@backend/lib/survey-dto';
import { notifySurveyRecipients, resolveSurveyAudience } from '@backend/services/survey-audience.service';

type SurveyRow = {
  id: number;
  title: string;
  status: SurveyStatus;
  publishedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
};

/** Recipient counts per survey, by status, in one grouped query. */
export async function surveyCounts(surveyIds: number[]): Promise<Map<number, SurveyCounts>> {
  const map = new Map<number, SurveyCounts>();
  if (surveyIds.length === 0) return map;
  const grouped = await prisma.surveyRecipient.groupBy({
    by: ['surveyId', 'status'],
    where: { surveyId: { in: surveyIds }, deletedAt: null },
    _count: { _all: true },
  });
  for (const g of grouped) {
    const counts = map.get(g.surveyId) ?? { ...EMPTY_COUNTS };
    const n = g._count._all;
    counts.recipients += n;
    if (g.status === 'ANSWERED') counts.answered += n;
    if (g.status === 'SKIPPED') counts.skipped += n;
    if (g.status === 'PENDING') counts.pending += n;
    map.set(g.surveyId, counts);
  }
  return map;
}

function toSummary(row: SurveyRow, counts: SurveyCounts | undefined): AdminSurveySummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    counts: counts ?? { ...EMPTY_COUNTS },
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toDetail(row: SurveyWithQuestions): Promise<AdminSurvey> {
  const counts = await surveyCounts([row.id]);
  return {
    ...toSummary(row, counts.get(row.id)),
    description: row.description,
    questions: row.questions.map(toQuestionDto),
  };
}

export async function requireSurvey(id: number): Promise<SurveyWithQuestions> {
  const row = await prisma.survey.findFirst({ where: { id, deletedAt: null }, include: surveyQuestionsInclude });
  if (!row) throw errors.notFound('Survey not found.');
  return row;
}

function assertDraft(row: { status: SurveyStatus }): void {
  if (row.status !== SurveyStatus.DRAFT) {
    throw errors.conflict("A published survey can't be changed — duplicate it instead.");
  }
}

export async function listAdminSurveys(
  q: AdminSurveyListQuery,
): Promise<{ surveys: AdminSurveySummary[]; meta: PaginationMeta }> {
  const where = { deletedAt: null, ...(q.status ? { status: q.status } : {}) };
  const [total, rows] = await prisma.$transaction([
    prisma.survey.count({ where }),
    prisma.survey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);
  const counts = await surveyCounts(rows.map((r) => r.id));
  return {
    surveys: rows.map((r) => toSummary(r, counts.get(r.id))),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
  };
}

export async function getAdminSurvey(id: number): Promise<AdminSurvey> {
  return toDetail(await requireSurvey(id));
}

export async function createSurveyDraft(adminId: number, input: SurveyDraft): Promise<AdminSurvey> {
  const row = await prisma.survey.create({
    data: {
      title: input.title,
      description: input.description,
      createdById: adminId,
      questions: { create: questionCreateData(input.questions) },
    },
    include: surveyQuestionsInclude,
  });
  return toDetail(row);
}

export async function updateSurveyDraft(id: number, input: SurveyDraft): Promise<AdminSurvey> {
  const existing = await requireSurvey(id);
  assertDraft(existing);
  const now = new Date();
  const questionIds = existing.questions.map((q) => q.id);

  await prisma.$transaction([
    prisma.surveyQuestionOption.updateMany({
      where: { questionId: { in: questionIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.surveyQuestion.updateMany({ where: { id: { in: questionIds } }, data: { deletedAt: now } }),
    prisma.survey.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        questions: { create: questionCreateData(input.questions) },
      },
    }),
  ]);
  return getAdminSurvey(id);
}

export async function deleteSurveyDraft(id: number): Promise<void> {
  assertDraft(await requireSurvey(id));
  await prisma.survey.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function duplicateSurvey(adminId: number, id: number): Promise<AdminSurvey> {
  const source = await requireSurvey(id);
  const title = `${source.title} (copy)`.slice(0, SURVEY_TITLE_MAX);
  return createSurveyDraft(adminId, {
    title,
    description: source.description,
    questions: source.questions.map((q) => ({
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      options: q.options.map((o) => o.label),
    })),
  });
}

export async function publishSurvey(id: number, target: SurveyTarget): Promise<SurveySendResult> {
  const survey = await requireSurvey(id);
  assertDraft(survey);
  if (survey.questions.length === 0) throw errors.badRequest('Add at least one question before publishing.');
  const userIds = await resolveSurveyAudience(target);
  if (userIds.length === 0) throw errors.badRequest('No mothers match this selection.');

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // The status guard makes a second, concurrent publish lose instead of
    // sending the survey twice.
    const { count } = await tx.survey.updateMany({
      where: { id, status: SurveyStatus.DRAFT, deletedAt: null },
      data: { status: SurveyStatus.PUBLISHED, publishedAt: now },
    });
    if (count === 0) throw errors.conflict('This survey has already been published.');
    await tx.surveyRecipient.createMany({
      data: userIds.map((userId) => ({ surveyId: id, userId, lastSentAt: now })),
      skipDuplicates: true,
    });
  });

  await notifySurveyRecipients(survey, userIds);
  return { count: userIds.length };
}

function assertPublished(row: { status: SurveyStatus }, action: string): void {
  if (row.status !== SurveyStatus.PUBLISHED) {
    throw errors.conflict(`Only a published survey can ${action}.`);
  }
}

export async function addSurveyRecipients(id: number, target: SurveyTarget): Promise<SurveySendResult> {
  const survey = await requireSurvey(id);
  assertPublished(survey, 'take more recipients');
  const audience = await resolveSurveyAudience(target);
  const existing = await prisma.surveyRecipient.findMany({
    where: { surveyId: id, userId: { in: audience } },
    select: { userId: true },
  });
  const already = new Set(existing.map((r) => r.userId));
  const fresh = audience.filter((userId) => !already.has(userId));
  if (fresh.length === 0) return { count: 0 };

  const now = new Date();
  await prisma.surveyRecipient.createMany({
    data: fresh.map((userId) => ({ surveyId: id, userId, lastSentAt: now })),
    skipDuplicates: true,
  });
  await notifySurveyRecipients(survey, fresh);
  return { count: fresh.length };
}
