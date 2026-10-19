import { Role, SurveyRecipientStatus, SurveyStatus, type User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';

import type { MotherSurvey, MotherSurveySummary, SubmitSurveyAnswersInput } from '@nanny-app/shared';
import { findSurveyAnswerProblem, hasAnswerValue } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { surveyQuestionsInclude, toQuestionDto } from '@backend/lib/survey-dto';

const OPEN_STATUSES = [SurveyRecipientStatus.PENDING, SurveyRecipientStatus.SKIPPED];

async function requireMother(decoded: DecodedIdToken): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can answer surveys.');
  return user;
}

/** Her recipient row on a survey she can still act on, with the survey's questions. */
async function requireOpenRecipient(userId: number, surveyId: number) {
  const recipient = await prisma.surveyRecipient.findFirst({
    where: { surveyId, userId, deletedAt: null, survey: { deletedAt: null, status: { not: SurveyStatus.DRAFT } } },
    include: { survey: { include: surveyQuestionsInclude } },
  });
  if (!recipient) throw errors.notFound('Survey not found.');
  if (recipient.survey.status === SurveyStatus.CLOSED) throw errors.conflict('This survey has closed.');
  if (recipient.status === SurveyRecipientStatus.ANSWERED) {
    throw errors.conflict('You have already answered this survey.');
  }
  return recipient;
}

/** PENDING and SKIPPED surveys on published surveys — the prompt and the profile list. Oldest send first. */
export async function listMyPendingSurveys(decoded: DecodedIdToken): Promise<MotherSurveySummary[]> {
  const user = await requireMother(decoded);
  const rows = await prisma.surveyRecipient.findMany({
    where: {
      userId: user.id,
      deletedAt: null,
      status: { in: OPEN_STATUSES },
      survey: { status: SurveyStatus.PUBLISHED, deletedAt: null },
    },
    include: {
      survey: { include: { _count: { select: { questions: { where: { deletedAt: null } } } } } },
    },
    orderBy: { lastSentAt: 'asc' },
  });
  return rows.map((r) => ({
    id: r.survey.id,
    title: r.survey.title,
    description: r.survey.description,
    status: r.status === SurveyRecipientStatus.SKIPPED ? 'SKIPPED' : 'PENDING',
    questionCount: r.survey._count.questions,
    lastSentAt: r.lastSentAt.toISOString(),
  }));
}

export async function getMySurvey(decoded: DecodedIdToken, surveyId: number): Promise<MotherSurvey> {
  const user = await requireMother(decoded);
  const { survey } = await requireOpenRecipient(user.id, surveyId);
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    questions: survey.questions.map(toQuestionDto),
  };
}

export async function skipMySurvey(decoded: DecodedIdToken, surveyId: number): Promise<void> {
  const user = await requireMother(decoded);
  const recipient = await requireOpenRecipient(user.id, surveyId);
  if (recipient.status === SurveyRecipientStatus.SKIPPED) return;
  // Status guard: a submit that commits between our read and write must win.
  const { count } = await prisma.surveyRecipient.updateMany({
    where: { id: recipient.id, status: SurveyRecipientStatus.PENDING },
    data: { status: SurveyRecipientStatus.SKIPPED, skippedAt: new Date() },
  });
  if (count === 0) {
    const current = await prisma.surveyRecipient.findUnique({ where: { id: recipient.id } });
    if (current?.status === SurveyRecipientStatus.ANSWERED) {
      throw errors.conflict('You have already answered this survey.');
    }
  }
}

export async function submitMySurveyAnswers(
  decoded: DecodedIdToken,
  surveyId: number,
  input: SubmitSurveyAnswersInput,
): Promise<void> {
  const user = await requireMother(decoded);
  const recipient = await requireOpenRecipient(user.id, surveyId);
  const questions = recipient.survey.questions;

  const problem = findSurveyAnswerProblem(questions, input.answers);
  if (problem) throw errors.badRequest(problem);

  const typeOf = new Map(questions.map((q) => [q.id, q.type]));
  const given = input.answers.filter((a) => hasAnswerValue(typeOf.get(a.questionId)!, a));

  await prisma.$transaction(async (tx) => {
    // Status guard: of two concurrent submits, only one flips the row.
    const { count } = await tx.surveyRecipient.updateMany({
      where: { id: recipient.id, status: { in: OPEN_STATUSES } },
      data: { status: SurveyRecipientStatus.ANSWERED, answeredAt: new Date() },
    });
    if (count === 0) throw errors.conflict('You have already answered this survey.');

    for (const answer of given) {
      await tx.surveyAnswer.create({
        data: {
          recipientId: recipient.id,
          questionId: answer.questionId,
          textValue: answer.text?.trim() ?? null,
          ratingValue: answer.rating ?? null,
          boolValue: answer.bool ?? null,
          ...(answer.optionIds ? { options: { create: answer.optionIds.map((optionId) => ({ optionId })) } } : {}),
        },
      });
    }
  });
}
