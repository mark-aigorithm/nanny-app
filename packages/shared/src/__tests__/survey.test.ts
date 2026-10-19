import { describe, expect, it } from 'vitest';

import {
  SurveyDraftSchema,
  SurveyResendSchema,
  SurveyTargetSchema,
  findSurveyAnswerProblem,
  hasAnswerValue,
  type SurveyQuestion,
} from '../survey';

const q = (over: Partial<SurveyQuestion> & Pick<SurveyQuestion, 'id' | 'type'>): SurveyQuestion => ({
  order: over.id,
  prompt: `Q${over.id}`,
  required: true,
  options: [],
  ...over,
});

const QUESTIONS: SurveyQuestion[] = [
  q({ id: 1, type: 'TEXT', required: false }),
  q({ id: 2, type: 'SINGLE_CHOICE', options: [{ id: 21, order: 0, label: 'A' }, { id: 22, order: 1, label: 'B' }] }),
  q({ id: 3, type: 'MULTI_CHOICE', required: false, options: [{ id: 31, order: 0, label: 'X' }, { id: 32, order: 1, label: 'Y' }] }),
  q({ id: 4, type: 'RATING' }),
  q({ id: 5, type: 'YES_NO' }),
];

const VALID = [
  { questionId: 2, optionIds: [21] },
  { questionId: 4, rating: 5 },
  { questionId: 5, bool: false },
];

describe('SurveyDraftSchema', () => {
  it('accepts a draft with no questions and turns an empty description into null', () => {
    const parsed = SurveyDraftSchema.parse({ title: ' Feedback ', description: '' });
    expect(parsed).toEqual({ title: 'Feedback', description: null, questions: [] });
  });

  it('defaults required to true and options to []', () => {
    const parsed = SurveyDraftSchema.parse({ title: 't', questions: [{ type: 'RATING', prompt: 'How?' }] });
    expect(parsed.questions[0]).toEqual({ type: 'RATING', prompt: 'How?', required: true, options: [] });
  });

  it('needs two distinct options on a choice question', () => {
    expect(SurveyDraftSchema.safeParse({ title: 't', questions: [{ type: 'SINGLE_CHOICE', prompt: 'p', options: ['A'] }] }).success).toBe(false);
    expect(SurveyDraftSchema.safeParse({ title: 't', questions: [{ type: 'MULTI_CHOICE', prompt: 'p', options: ['A', 'a'] }] }).success).toBe(false);
  });

  it('refuses options on a non-choice question', () => {
    expect(SurveyDraftSchema.safeParse({ title: 't', questions: [{ type: 'TEXT', prompt: 'p', options: ['A', 'B'] }] }).success).toBe(false);
  });
});

describe('SurveyTargetSchema', () => {
  it('needs at least one way of choosing mothers', () => {
    expect(SurveyTargetSchema.safeParse({}).success).toBe(false);
    expect(SurveyTargetSchema.parse({ groupIds: [3] })).toEqual({ allMothers: false, groupIds: [3], userIds: [] });
  });
});

describe('SurveyResendSchema', () => {
  it('takes either user ids or a status, not both', () => {
    expect(SurveyResendSchema.safeParse({ userIds: [1] }).success).toBe(true);
    expect(SurveyResendSchema.safeParse({ status: 'SKIPPED' }).success).toBe(true);
    expect(SurveyResendSchema.safeParse({ status: 'ANSWERED' }).success).toBe(false);
    expect(SurveyResendSchema.safeParse({ userIds: [1], status: 'PENDING' }).success).toBe(false);
  });
});

describe('hasAnswerValue', () => {
  it('treats blank text and empty option lists as unanswered', () => {
    expect(hasAnswerValue('TEXT', { questionId: 1, text: '   ' })).toBe(false);
    expect(hasAnswerValue('MULTI_CHOICE', { questionId: 3, optionIds: [] })).toBe(false);
    expect(hasAnswerValue('YES_NO', { questionId: 5, bool: false })).toBe(true);
    expect(hasAnswerValue('RATING', undefined)).toBe(false);
  });
});

describe('findSurveyAnswerProblem', () => {
  it('accepts a complete submission with optional questions left out', () => {
    expect(findSurveyAnswerProblem(QUESTIONS, VALID)).toBeNull();
  });

  it('names the first unanswered required question', () => {
    expect(findSurveyAnswerProblem(QUESTIONS, VALID.slice(1))).toBe('"Q2" is required.');
  });

  it('refuses an answer to a question not in the survey', () => {
    expect(findSurveyAnswerProblem(QUESTIONS, [...VALID, { questionId: 99, text: 'x' }])).toMatch(/not in this survey/);
  });

  it('refuses the same question answered twice', () => {
    expect(findSurveyAnswerProblem(QUESTIONS, [...VALID, { questionId: 4, rating: 2 }])).toMatch(/answered twice/);
  });

  it('refuses the wrong kind of value for the type', () => {
    expect(findSurveyAnswerProblem(QUESTIONS, [VALID[0]!, { questionId: 4, text: '5' }, VALID[2]!])).toMatch(/wrong kind of answer/);
    expect(findSurveyAnswerProblem(QUESTIONS, [VALID[0]!, { questionId: 4, rating: 4, bool: true }, VALID[2]!])).toMatch(/wrong kind of answer/);
  });

  it('refuses an option from another question, a repeated option, and two picks on a single choice', () => {
    expect(findSurveyAnswerProblem(QUESTIONS, [{ questionId: 2, optionIds: [31] }, ...VALID.slice(1)])).toMatch(/doesn't belong/);
    expect(findSurveyAnswerProblem(QUESTIONS, [...VALID, { questionId: 3, optionIds: [31, 31] }])).toMatch(/more than once/);
    expect(findSurveyAnswerProblem(QUESTIONS, [{ questionId: 2, optionIds: [21, 22] }, ...VALID.slice(1)])).toBe('Pick one option for "Q2".');
  });
});
