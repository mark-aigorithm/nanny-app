import { useState } from 'react';

import {
  CANCELLATION_CELL_CHOICES,
  OTHER_CELL_CHOICE_ID,
  cellProposalProblem,
  type CancellationCellProposal,
  type CancellationOutcomeKey,
  type SetCancellationCellProposalInput,
} from '@nanny-app/shared';

import { Button, Field, FormModal, Select, useToast } from '@admin/components/ui';
import { apiErrorMessage } from '@admin/lib/api-error';

import type { Outcome } from './flows';
import { OutcomeValue } from './outcome-value';
import { useClearCellProposal, useSetCellProposal, type CellRef } from './use-cell-proposals';

type CellEditorProps = {
  cell: CellRef;
  scenario: string;
  /** The column's heading, e.g. "Package hours". */
  outcomeLabel: string;
  today: Outcome;
  proposal: CancellationCellProposal | undefined;
  /** Prefills "Your name" with whoever last saved from this page. */
  defaultName: string;
  /** After a save, with the name it was saved under. */
  onSaved: (proposedBy: string) => void;
  onClose: () => void;
};

/**
 * Proposes what should happen in one cell of the "What happens today" table:
 * a quick choice for the column (with its % where it takes one), or the
 * team's own words.
 */
export function CellEditor({
  cell,
  scenario,
  outcomeLabel,
  today,
  proposal,
  defaultName,
  onSaved,
  onClose,
}: CellEditorProps) {
  const toast = useToast();
  const setProposal = useSetCellProposal();
  const clearProposal = useClearCellProposal();
  const busy = setProposal.isPending || clearProposal.isPending;

  const outcome: CancellationOutcomeKey = cell.outcome;
  const choices = CANCELLATION_CELL_CHOICES[outcome];
  const [choiceId, setChoiceId] = useState(proposal?.choiceId ?? choices[0]!.id);
  const [percent, setPercent] = useState(proposal?.percent?.toString() ?? '');
  const [text, setText] = useState(proposal?.text ?? '');
  const [proposedBy, setProposedBy] = useState(proposal?.proposedBy || defaultName);

  const choice = choices.find((c) => c.id === choiceId);
  const percentNumber = Number(percent);
  const input: SetCancellationCellProposalInput = {
    choiceId,
    ...(choice?.percentLabel && percent !== '' && { percent: percentNumber }),
    text: text.trim(),
    proposedBy: proposedBy.trim(),
  };
  const percentInvalid =
    choice?.percentLabel !== undefined &&
    percent !== '' &&
    !(Number.isInteger(percentNumber) && percentNumber >= 1 && percentNumber <= 100);
  const problem = percentInvalid ? 'Enter a whole number from 1 to 100' : cellProposalProblem(outcome, input);
  const isOther = choiceId === OTHER_CELL_CHOICE_ID;

  return (
    <FormModal
      title={`${outcomeLabel} — ${scenario}`}
      submitLabel={proposal ? 'Update change' : 'Save change'}
      onSubmit={() =>
        setProposal.mutate(
          { cell, input },
          {
            onSuccess: () => {
              toast.success('Change saved', `${outcomeLabel} — ${scenario}`);
              onSaved(input.proposedBy ?? '');
              onClose();
            },
          },
        )
      }
      onClose={onClose}
      busy={busy}
      submitDisabled={problem !== null}
      error={
        setProposal.error
          ? apiErrorMessage(setProposal.error)
          : clearProposal.error
            ? apiErrorMessage(clearProposal.error)
            : null
      }
    >
      <div className="flows-cell-today">
        <span className="field-label">Today</span>
        <OutcomeValue outcome={today} />
      </div>

      {choices.length > 1 && (
        <Field label="What should happen">
          <Select
            value={choiceId}
            aria-label="What should happen"
            options={choices.map((c) => ({ value: c.id, label: c.label }))}
            onChange={setChoiceId}
          />
        </Field>
      )}

      {choice?.percentLabel && (
        <Field label={choice.percentLabel}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        </Field>
      )}

      <Field
        label={isOther ? (outcome === 'notifications' ? 'What the notice should say' : 'What should happen') : 'Details'}
        hint={isOther ? undefined : 'Optional — any condition or limit, e.g. “only within 24 hours”.'}
      >
        <textarea
          className="qa-note"
          rows={3}
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>

      <Field label="Your name">
        <input
          type="text"
          maxLength={40}
          value={proposedBy}
          placeholder="Your name or initials"
          onChange={(event) => setProposedBy(event.target.value)}
        />
      </Field>

      {proposal && (
        <div className="flows-cell-reset">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              clearProposal.mutate(cell, {
                onSuccess: () => {
                  toast.success('Back to today', `${outcomeLabel} — ${scenario}`);
                  onClose();
                },
              })
            }
          >
            Back to today
          </Button>
        </div>
      )}
    </FormModal>
  );
}
