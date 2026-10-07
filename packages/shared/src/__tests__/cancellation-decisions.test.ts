import { describe, expect, it } from 'vitest';

import {
  CANCELLATION_DECISIONS,
  SetCancellationDecisionSchema,
  isCancellationDecisionId,
  isCancellationDecisionOption,
} from '../cancellation-decisions';

describe('CANCELLATION_DECISIONS', () => {
  it('gives every decision a unique id', () => {
    const ids = CANCELLATION_DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A recorded answer stores the option id, so two options sharing one would
  // make the answer ambiguous.
  it('gives every option a unique id within its decision', () => {
    for (const decision of CANCELLATION_DECISIONS) {
      const ids = decision.options.map((o) => o.id);
      expect(new Set(ids).size, decision.id).toBe(ids.length);
    }
  });

  it('offers at least two options per decision', () => {
    for (const decision of CANCELLATION_DECISIONS) {
      expect(decision.options.length, decision.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('isCancellationDecisionOption', () => {
  const decision = CANCELLATION_DECISIONS[0]!;
  const option = decision.options[0]!;

  it('accepts an option of that decision', () => {
    expect(isCancellationDecisionOption(decision.id, option.id)).toBe(true);
  });

  it('refuses an option that belongs to no decision', () => {
    expect(isCancellationDecisionOption(decision.id, 'not-an-option')).toBe(false);
  });

  it('refuses an unknown decision', () => {
    expect(isCancellationDecisionOption('not-a-decision', option.id)).toBe(false);
    expect(isCancellationDecisionId('not-a-decision')).toBe(false);
  });
});

describe('SetCancellationDecisionSchema', () => {
  it('requires an option', () => {
    expect(SetCancellationDecisionSchema.safeParse({ optionId: '' }).success).toBe(false);
  });

  it('caps the free text', () => {
    expect(
      SetCancellationDecisionSchema.safeParse({ optionId: 'x', note: 'a'.repeat(501) }).success,
    ).toBe(false);
    expect(
      SetCancellationDecisionSchema.safeParse({ optionId: 'x', decidedBy: 'a'.repeat(41) }).success,
    ).toBe(false);
  });
});
