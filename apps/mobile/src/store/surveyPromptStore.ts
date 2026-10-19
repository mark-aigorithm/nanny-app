import type { MotherSurveySummary } from '@nanny-app/shared';

// Surveys already prompted this session: after Answer (she may back out),
// Skip (the refetch may not have landed yet) or a dismiss, the sheet must not
// reopen until the next launch. Cleared on app relaunch (module reload) and on
// an account change (clearUserQueries), since survey ids are not per account.
const prompted = new Set<number>();

export function clearPromptedSurveys(): void {
  prompted.clear();
}

export function markSurveyPrompted(id: number): void {
  prompted.add(id);
}

export function wasSurveyPrompted(id: number): boolean {
  return prompted.has(id);
}

export function promptedSurveys(): ReadonlySet<number> {
  return prompted;
}

/** The oldest PENDING survey not prompted this session; SKIPPED ones never prompt. */
export function pickSurveyToPrompt(
  surveys: MotherSurveySummary[],
  dismissed: ReadonlySet<number>,
): MotherSurveySummary | null {
  return surveys.find((s) => s.status === 'PENDING' && !dismissed.has(s.id)) ?? null;
}
