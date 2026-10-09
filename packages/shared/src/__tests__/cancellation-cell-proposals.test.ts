import { describe, expect, it } from 'vitest';

import {
  CANCELLATION_CELL_CHOICES,
  CANCELLATION_OUTCOME_KEYS,
  OTHER_CELL_CHOICE_ID,
  cellProposalProblem,
  findCancellationCellChoice,
  summarizeCellProposal,
} from '../cancellation-cell-proposals';

describe('CANCELLATION_CELL_CHOICES', () => {
  // A recorded proposal stores the choice id, so two choices sharing one
  // within a column would make it ambiguous.
  it('gives every choice a unique id within its column', () => {
    for (const outcome of CANCELLATION_OUTCOME_KEYS) {
      const ids = CANCELLATION_CELL_CHOICES[outcome].map((c) => c.id);
      expect(new Set(ids).size, outcome).toBe(ids.length);
    }
  });

  it('always lets the team write something of their own', () => {
    for (const outcome of CANCELLATION_OUTCOME_KEYS) {
      expect(findCancellationCellChoice(outcome, OTHER_CELL_CHOICE_ID), outcome).toBeDefined();
    }
  });

  it('puts {percent} in the summary of exactly the choices that ask for one', () => {
    for (const outcome of CANCELLATION_OUTCOME_KEYS) {
      for (const choice of CANCELLATION_CELL_CHOICES[outcome]) {
        expect(choice.summary.includes('{percent}'), `${outcome}/${choice.id}`).toBe(
          choice.percentLabel !== undefined,
        );
      }
    }
  });
});

describe('summarizeCellProposal', () => {
  it('fills in the percentage', () => {
    const choice = findCancellationCellChoice('money', 'refund-percent-to-card')!;
    expect(summarizeCellProposal(choice, 50)).toBe('50% refunded to the card');
  });
});

describe('cellProposalProblem', () => {
  it('accepts a plain choice of the column', () => {
    expect(cellProposalProblem('promoCode', { choiceId: 'usable-again' })).toBeNull();
  });

  it('refuses a choice from another column', () => {
    expect(cellProposalProblem('promoCode', { choiceId: 'no-refund' })).toMatch(/Unknown choice/);
  });

  it('needs the percentage of a % choice, and refuses one anywhere else', () => {
    expect(cellProposalProblem('packageHours', { choiceId: 'returned-minus-percent' })).toMatch(
      /needs a percentage/,
    );
    expect(
      cellProposalProblem('packageHours', { choiceId: 'returned-minus-percent', percent: 20 }),
    ).toBeNull();
    expect(cellProposalProblem('packageHours', { choiceId: 'returned-in-full', percent: 20 })).toMatch(
      /takes no percentage/,
    );
  });

  it('needs the text of "Something else"', () => {
    expect(cellProposalProblem('notifications', { choiceId: 'other', text: '  ' })).toMatch(
      /Write what should happen/,
    );
    expect(
      cellProposalProblem('notifications', { choiceId: 'other', text: 'Tell her the refund date.' }),
    ).toBeNull();
  });
});
