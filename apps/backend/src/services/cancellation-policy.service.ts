import {
  CancellationDecisionEntrySchema,
  isCancellationDecisionId,
  isCancellationDecisionOption,
  type CancellationDecisionEntry,
  type CancellationDecisionsState,
  type SetCancellationDecisionInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * The option the business team picked for each cancellation-policy decision on
 * the console's public /cancellation-flows page.
 *
 * Same storage idiom as qa-checklist.service.ts, for the same reasons: an
 * app_settings row per decision (the API is serverless, and several people may
 * record at once), JSON values validated on the way out, and the shared
 * catalogue as the allowlist that keeps an unauthenticated write away from
 * every other app_settings key.
 */
const KEY_PREFIX = 'cancellation_policy:';

function keyFor(decisionId: string): string {
  return `${KEY_PREFIX}${decisionId}`;
}

/** A row that no longer parses reads as "still open" rather than breaking the page. */
function parseEntry(value: string): CancellationDecisionEntry | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = CancellationDecisionEntrySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Every recorded answer, keyed by decision id. Open decisions are absent. */
export async function getCancellationDecisions(): Promise<CancellationDecisionsState> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { startsWith: KEY_PREFIX }, deletedAt: null },
  });

  const entries: Record<string, CancellationDecisionEntry> = {};
  for (const row of rows) {
    const decisionId = row.key.slice(KEY_PREFIX.length);
    const entry = parseEntry(row.value);
    // Skip a decision or option retired from the catalogue, so the response
    // only ever points at choices the page can still show.
    if (entry && isCancellationDecisionOption(decisionId, entry.optionId)) {
      entries[decisionId] = entry;
    }
  }

  return { entries };
}

/** Records the chosen option, replacing any earlier answer for that decision. */
export async function setCancellationDecision(
  decisionId: string,
  input: SetCancellationDecisionInput,
): Promise<CancellationDecisionEntry> {
  if (!isCancellationDecisionId(decisionId)) {
    throw errors.badRequest(`Unknown decision: ${decisionId}`);
  }
  if (!isCancellationDecisionOption(decisionId, input.optionId)) {
    throw errors.badRequest(`Unknown option for ${decisionId}: ${input.optionId}`);
  }

  const entry: CancellationDecisionEntry = {
    optionId: input.optionId,
    decidedBy: input.decidedBy?.trim() ?? '',
    note: input.note?.trim() ?? '',
    updatedAt: new Date().toISOString(),
  };

  const key = keyFor(decisionId);
  const value = JSON.stringify(entry);
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value, deletedAt: null },
  });

  return entry;
}

/** Re-opens a decision. Soft-deleted, so an earlier answer is still in the table. */
export async function clearCancellationDecision(decisionId: string): Promise<void> {
  if (!isCancellationDecisionId(decisionId)) {
    throw errors.badRequest(`Unknown decision: ${decisionId}`);
  }
  await prisma.appSettings.updateMany({
    where: { key: keyFor(decisionId), deletedAt: null },
    data: { deletedAt: new Date() },
  });
}
