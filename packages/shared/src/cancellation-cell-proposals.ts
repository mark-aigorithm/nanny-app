import { z } from 'zod';

/**
 * Changes the business team proposes to single cells of the "What happens
 * today" table on the console's public /cancellation-flows page: for one
 * cancellation scenario and one outcome (package hours, Care Points, promo
 * code, money, notifications), what they want to happen instead.
 *
 * Shared rather than kept in the console because the server records each
 * proposal and uses the scenario ids, outcome keys and choices below as the
 * allowlist for that unauthenticated write — like QA_SCENARIOS for /qa.
 * The scenarios' wording lives with the table in apps/admin; only their ids
 * are here, and the console's flows are typed against them.
 */

export const CANCELLATION_FLOW_IDS = [
  'mother-unclaimed',
  'mother-unpaid',
  'mother-paid-outside',
  'mother-paid-inside',
  'shift-running',
  'admin-reject',
  'admin-cancel-paid',
  'paid-after-cancel',
  'extension-withdrawn',
  'account-deletion',
] as const;
export type CancellationFlowId = (typeof CANCELLATION_FLOW_IDS)[number];

export const CANCELLATION_OUTCOME_KEYS = [
  'packageHours',
  'carePoints',
  'promoCode',
  'money',
  'notifications',
] as const;
export type CancellationOutcomeKey = (typeof CANCELLATION_OUTCOME_KEYS)[number];

export type CancellationCellChoiceTone = 'success' | 'warning' | 'danger' | 'neutral';

export type CancellationCellChoice = {
  /** Stable across copy edits: recorded proposals point at it. */
  id: string;
  /** What the editor offers, e.g. "Returned minus a %". */
  label: string;
  tone: CancellationCellChoiceTone;
  /** Set when the choice needs a percentage; names the field, e.g. "% kept as a fee". */
  percentLabel?: string;
  /** How the choice reads in the table; `{percent}` is replaced by the number. */
  summary: string;
};

/** "Something else": always offered, and the free text is then required. */
export const OTHER_CELL_CHOICE_ID = 'other';

const OTHER: CancellationCellChoice = {
  id: OTHER_CELL_CHOICE_ID,
  label: 'Something else (write it below)',
  tone: 'neutral',
  summary: 'Something else',
};

const ADMIN_DECIDES: CancellationCellChoice = {
  id: 'admin-decides',
  label: 'An admin decides each time',
  tone: 'neutral',
  summary: 'An admin decides each time',
};

export const CANCELLATION_CELL_CHOICES: Record<
  CancellationOutcomeKey,
  readonly CancellationCellChoice[]
> = {
  packageHours: [
    { id: 'returned-in-full', label: 'Returned in full', tone: 'success', summary: 'Returned in full' },
    {
      id: 'returned-minus-percent',
      label: 'Returned minus a %',
      tone: 'warning',
      percentLabel: '% kept as a fee',
      summary: 'Returned minus {percent}%',
    },
    {
      id: 'returned-as-care-points',
      label: 'Returned as Care Points',
      tone: 'success',
      summary: 'Returned as Care Points',
    },
    { id: 'not-returned', label: 'Not returned', tone: 'danger', summary: 'Not returned' },
    ADMIN_DECIDES,
    OTHER,
  ],
  carePoints: [
    { id: 'returned-in-full', label: 'Returned in full', tone: 'success', summary: 'Returned in full' },
    {
      id: 'returned-minus-percent',
      label: 'Returned minus a %',
      tone: 'warning',
      percentLabel: '% kept as a fee',
      summary: 'Returned minus {percent}%',
    },
    { id: 'not-returned', label: 'Not returned', tone: 'danger', summary: 'Not returned' },
    ADMIN_DECIDES,
    OTHER,
  ],
  promoCode: [
    { id: 'usable-again', label: 'Can be used again', tone: 'success', summary: 'Can be used again' },
    { id: 'stays-used', label: 'Stays used', tone: 'danger', summary: 'Stays used' },
    OTHER,
  ],
  money: [
    {
      id: 'refund-to-card-in-full',
      label: 'Refund to the card in full',
      tone: 'success',
      summary: 'Refunded to the card in full',
    },
    {
      id: 'refund-percent-to-card',
      label: 'Refund a % to the card',
      tone: 'warning',
      percentLabel: '% refunded',
      summary: '{percent}% refunded to the card',
    },
    {
      id: 'refund-as-care-points',
      label: 'Refund as Care Points',
      tone: 'success',
      summary: 'Refunded as Care Points',
    },
    {
      id: 'refund-as-care-points-plus-bonus',
      label: 'Refund as Care Points + a bonus %',
      tone: 'success',
      percentLabel: 'Bonus %',
      summary: 'Refunded as Care Points + {percent}% bonus',
    },
    { id: 'no-refund', label: 'No refund', tone: 'danger', summary: 'No refund' },
    ADMIN_DECIDES,
    OTHER,
  ],
  // What a notice says is wording, not a pick from a list.
  notifications: [{ ...OTHER, label: 'New wording (write it below)', summary: 'New wording' }],
};

export function isCancellationFlowId(value: string): value is CancellationFlowId {
  return (CANCELLATION_FLOW_IDS as readonly string[]).includes(value);
}

export function isCancellationOutcomeKey(value: string): value is CancellationOutcomeKey {
  return (CANCELLATION_OUTCOME_KEYS as readonly string[]).includes(value);
}

export function findCancellationCellChoice(
  outcome: CancellationOutcomeKey,
  choiceId: string,
): CancellationCellChoice | undefined {
  return CANCELLATION_CELL_CHOICES[outcome].find((c) => c.id === choiceId);
}

/** The proposal as the table shows it, e.g. "Returned minus 20%". */
export function summarizeCellProposal(
  choice: CancellationCellChoice,
  percent: number | undefined,
): string {
  return choice.summary.replace('{percent}', String(percent ?? ''));
}

/** "packageHours" under "mother-paid-inside" → one stored proposal. */
export function cancellationCellKey(flowId: CancellationFlowId, outcome: CancellationOutcomeKey): string {
  return `${flowId}.${outcome}`;
}

/** One proposed change to one cell. */
export const CancellationCellProposalSchema = z.object({
  choiceId: z.string().max(80),
  percent: z.number().int().min(1).max(100).optional(),
  /** Details, or the whole proposal for "Something else". Capped so an open endpoint cannot be used as storage. */
  text: z.string().max(500).default(''),
  /** Who proposed it — a name or initials, not an identity. */
  proposedBy: z.string().max(40).default(''),
  updatedAt: z.string(),
});
export type CancellationCellProposal = z.infer<typeof CancellationCellProposalSchema>;

/** The write payload: everything but `updatedAt`, which the server stamps. */
export const SetCancellationCellProposalSchema = z.object({
  choiceId: z.string().min(1).max(80),
  percent: z.number().int().min(1).max(100).optional(),
  text: z.string().max(500).optional(),
  proposedBy: z.string().max(40).optional(),
});
export type SetCancellationCellProposalInput = z.infer<typeof SetCancellationCellProposalSchema>;

/**
 * Why a proposal can't be recorded for this cell, or null when it can: the
 * choice must belong to the cell's column, a % choice needs its number (and
 * only it may carry one), and "Something else" needs its text.
 */
export function cellProposalProblem(
  outcome: CancellationOutcomeKey,
  input: SetCancellationCellProposalInput,
): string | null {
  const choice = findCancellationCellChoice(outcome, input.choiceId);
  if (!choice) return `Unknown choice for ${outcome}: ${input.choiceId}`;
  if (choice.percentLabel && input.percent === undefined) return `${choice.label} needs a percentage`;
  if (!choice.percentLabel && input.percent !== undefined) return `${choice.label} takes no percentage`;
  if (choice.id === OTHER_CELL_CHOICE_ID && !input.text?.trim()) return 'Write what should happen';
  return null;
}

export interface CancellationCellProposalsState {
  /** Keyed by cancellationCellKey(flowId, outcome). A cell with no entry is unchanged. */
  entries: Record<string, CancellationCellProposal>;
}
