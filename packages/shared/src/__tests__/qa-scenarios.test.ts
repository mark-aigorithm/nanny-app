/**
 * The catalogue is data, so the things that can rot about it are structural:
 * a duplicated id silently merges two scenarios' results into one row, and an
 * empty steps list ships a scenario nobody can run. Both are cheap to pin.
 */
import { describe, expect, it } from 'vitest';

import {
  QA_SCENARIOS,
  QA_SCENARIO_IDS,
  QaChecklistEntrySchema,
  SetQaScenarioStatusSchema,
  isQaScenarioId,
} from '../qa-scenarios';

describe('QA scenario catalogue', () => {
  it('has a unique id for every scenario', () => {
    // Set size tells us there are no duplicates; the message tells us which.
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const scenario of QA_SCENARIOS) {
      if (seen.has(scenario.id)) duplicates.push(scenario.id);
      seen.add(scenario.id);
    }

    expect(duplicates).toEqual([]);
    expect(QA_SCENARIO_IDS.size).toBe(QA_SCENARIOS.length);
  });

  it('gives every scenario a title, at least one step and at least one expectation', () => {
    const incomplete = QA_SCENARIOS.filter(
      (s) => s.title.trim() === '' || s.steps.length === 0 || s.expected.length === 0,
    ).map((s) => s.id);

    expect(incomplete).toEqual([]);
  });

  it('uses kebab-case ids, so a persistence key never needs escaping', () => {
    const malformed = QA_SCENARIOS.filter((s) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)).map(
      (s) => s.id,
    );

    expect(malformed).toEqual([]);
  });

  it('recognises its own ids and rejects anything else', () => {
    expect(isQaScenarioId(QA_SCENARIOS[0]!.id)).toBe(true);
    expect(isQaScenarioId('not-a-real-scenario')).toBe(false);
    // The allowlist is what stops an open endpoint writing arbitrary settings
    // keys, so a namespaced guess must miss too.
    expect(isQaScenarioId('qa_checklist:parent-sign-in')).toBe(false);
  });

  it('leads with the flows that happen most often', () => {
    // Not an ordering proof — just a guard that a refactor has not shuffled the
    // most-trodden journey out of the front of the list.
    expect(QA_SCENARIOS[0]!.id).toBe('parent-sign-in');
    expect(QA_SCENARIOS.slice(0, 20).every((s) => s.priority !== 'P2')).toBe(true);
  });

  it('caps the free-text fields a public endpoint accepts', () => {
    const tooLong = SetQaScenarioStatusSchema.safeParse({
      status: 'PASS',
      note: 'x'.repeat(501),
    });
    expect(tooLong.success).toBe(false);

    const ok = SetQaScenarioStatusSchema.safeParse({ status: 'FAIL', note: 'nanny never showed' });
    expect(ok.success).toBe(true);
  });

  it('rejects a status outside the enum', () => {
    expect(
      QaChecklistEntrySchema.safeParse({
        status: 'DONE',
        note: '',
        tester: '',
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});
