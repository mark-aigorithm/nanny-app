import {
  CancellationCellProposalSchema,
  cancellationCellKey,
  cellProposalProblem,
  findCancellationCellChoice,
  isCancellationFlowId,
  isCancellationOutcomeKey,
  type CancellationCellProposal,
  type CancellationCellProposalsState,
  type CancellationFlowId,
  type CancellationOutcomeKey,
  type SetCancellationCellProposalInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * Changes the business team proposes to single cells of the "What happens
 * today" table on the console's public /cancellation-flows page.
 *
 * Same storage idiom as cancellation-policy.service.ts: an app_settings row
 * per cell, JSON validated on the way out, and the shared scenario ids,
 * outcome keys and choices as the allowlist that keeps an unauthenticated
 * write away from every other app_settings key.
 */
const KEY_PREFIX = 'cancellation_cell:';

type Cell = { flowId: CancellationFlowId; outcome: CancellationOutcomeKey };

function settingsKey(cell: Cell): string {
  return `${KEY_PREFIX}${cancellationCellKey(cell.flowId, cell.outcome)}`;
}

/** Refuses anything but a scenario and column of the table. */
function toCell(flowId: string, outcome: string): Cell {
  if (!isCancellationFlowId(flowId)) throw errors.badRequest(`Unknown scenario: ${flowId}`);
  if (!isCancellationOutcomeKey(outcome)) throw errors.badRequest(`Unknown column: ${outcome}`);
  return { flowId, outcome };
}

/** A row that no longer parses reads as "unchanged" rather than breaking the page. */
function parseProposal(value: string): CancellationCellProposal | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = CancellationCellProposalSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Every proposed change, keyed by cancellationCellKey. Unchanged cells are absent. */
export async function getCancellationCellProposals(): Promise<CancellationCellProposalsState> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { startsWith: KEY_PREFIX }, deletedAt: null },
  });

  const entries: Record<string, CancellationCellProposal> = {};
  for (const row of rows) {
    const [flowId = '', outcome = ''] = row.key.slice(KEY_PREFIX.length).split('.');
    const proposal = parseProposal(row.value);
    // Skip a scenario, column or choice retired from the catalogue, so the
    // response only ever points at cells and choices the page can still show.
    if (
      proposal &&
      isCancellationFlowId(flowId) &&
      isCancellationOutcomeKey(outcome) &&
      findCancellationCellChoice(outcome, proposal.choiceId)
    ) {
      entries[cancellationCellKey(flowId, outcome)] = proposal;
    }
  }

  return { entries };
}

/** Records the proposal for one cell, replacing any earlier one. */
export async function setCancellationCellProposal(
  flowId: string,
  outcome: string,
  input: SetCancellationCellProposalInput,
): Promise<CancellationCellProposal> {
  const cell = toCell(flowId, outcome);
  const problem = cellProposalProblem(cell.outcome, input);
  if (problem) throw errors.badRequest(problem);

  const proposal: CancellationCellProposal = {
    choiceId: input.choiceId,
    ...(input.percent !== undefined && { percent: input.percent }),
    text: input.text?.trim() ?? '',
    proposedBy: input.proposedBy?.trim() ?? '',
    updatedAt: new Date().toISOString(),
  };

  const key = settingsKey(cell);
  const value = JSON.stringify(proposal);
  await prisma.appSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value, deletedAt: null },
  });

  return proposal;
}

/** Puts a cell back to what happens today. Soft-deleted, so the proposal is still in the table. */
export async function clearCancellationCellProposal(flowId: string, outcome: string): Promise<void> {
  const cell = toCell(flowId, outcome);
  await prisma.appSettings.updateMany({
    where: { key: settingsKey(cell), deletedAt: null },
    data: { deletedAt: new Date() },
  });
}
