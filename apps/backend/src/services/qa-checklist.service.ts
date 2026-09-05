import {
  QaChecklistEntrySchema,
  isQaScenarioId,
  type QaChecklistEntry,
  type QaChecklistState,
  type SetQaScenarioStatusInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * The manual release-test checklist: which scenarios have been walked, by whom,
 * and what happened.
 *
 * Stored in app_settings rather than on disk because the API runs serverless —
 * a file would be lost on the next deploy and invisible to the next invocation.
 * One row per scenario rather than one blob for the whole checklist: several
 * people tick at once during a release test, and a single blob would make every
 * save a read-modify-write of the entire list, so two simultaneous saves would
 * silently drop one. Keyed rows make concurrent writes independent.
 *
 * Follows support-contact.service.ts for the key/value idiom, including the
 * `deletedAt: null` filter and the upsert that revives a soft-deleted row.
 */
const KEY_PREFIX = 'qa_checklist:';

function keyFor(scenarioId: string): string {
  return `${KEY_PREFIX}${scenarioId}`;
}

/**
 * A row whose JSON no longer parses — hand-edited, or written by an older
 * shape — is treated as "never run" rather than crashing the whole checklist.
 * Losing one tick is a smaller failure than a page that will not load.
 */
function parseEntry(value: string): QaChecklistEntry | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = QaChecklistEntrySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Every recorded result, keyed by scenario id. Unrun scenarios are absent. */
export async function getQaChecklist(): Promise<QaChecklistState> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { startsWith: KEY_PREFIX }, deletedAt: null },
  });

  const entries: Record<string, QaChecklistEntry> = {};
  for (const row of rows) {
    const scenarioId = row.key.slice(KEY_PREFIX.length);
    // A scenario retired from the catalogue leaves its row behind; skip it so
    // the response only ever describes scenarios that still exist.
    if (!isQaScenarioId(scenarioId)) continue;
    const entry = parseEntry(row.value);
    if (entry) entries[scenarioId] = entry;
  }

  return { entries };
}

/**
 * Records one result. `scenarioId` is checked against the catalogue before
 * anything is written — that allowlist is what keeps an unauthenticated
 * endpoint from reaching any other app_settings key.
 */
export async function setQaScenarioStatus(
  scenarioId: string,
  input: SetQaScenarioStatusInput,
): Promise<QaChecklistEntry> {
  if (!isQaScenarioId(scenarioId)) {
    throw errors.badRequest(`Unknown scenario: ${scenarioId}`);
  }

  const entry: QaChecklistEntry = {
    status: input.status,
    note: input.note?.trim() ?? '',
    tester: input.tester?.trim() ?? '',
    updatedAt: new Date().toISOString(),
  };

  const key = keyFor(scenarioId);
  const value = JSON.stringify(entry);
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value, deletedAt: null },
  });

  return entry;
}

/**
 * Clears every result to start a fresh test round. Scoped to the prefix, so
 * platform config and support contact rows in the same table are untouched.
 */
export async function resetQaChecklist(): Promise<number> {
  const { count } = await prisma.appSettings.deleteMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  return count;
}
