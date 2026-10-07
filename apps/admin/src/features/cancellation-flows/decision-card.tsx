import { useEffect, useState } from 'react';

import type {
  CancellationDecision,
  CancellationDecisionEntry,
  CancellationOptionStatus,
  SetCancellationDecisionInput,
} from '@nanny-app/shared';

import { Badge, Button, Card, Field, Select } from '@admin/components/ui';

const STATUS_BADGE: Record<CancellationOptionStatus, { tone: 'neutral' | 'success'; label: string }> = {
  today: { tone: 'neutral', label: 'Today' },
  proposed: { tone: 'success', label: 'Proposed' },
};

const NO_OPTION = '';

/** Whether answers can be recorded from this page right now. */
export type RecordingState = 'loading' | 'on' | 'off';

type DecisionCardProps = {
  decision: CancellationDecision;
  number: number;
  entry: CancellationDecisionEntry | undefined;
  recording: RecordingState;
  saving: boolean;
  onSave: (input: SetCancellationDecisionInput) => void;
  onClear: () => void;
};

function formatDecidedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** One policy question with its options side by side, and the answer recorded for it. */
export function DecisionCard({
  decision,
  number,
  entry,
  recording,
  saving,
  onSave,
  onClear,
}: DecisionCardProps) {
  const [optionId, setOptionId] = useState(entry?.optionId ?? NO_OPTION);
  const [decidedBy, setDecidedBy] = useState(entry?.decidedBy ?? '');
  const [note, setNote] = useState(entry?.note ?? '');

  // Someone else may record (or clear) this decision while the page is open;
  // follow the server whenever its answer changes.
  useEffect(() => {
    setOptionId(entry?.optionId ?? NO_OPTION);
    setDecidedBy(entry?.decidedBy ?? '');
    setNote(entry?.note ?? '');
  }, [entry?.updatedAt, entry?.optionId, entry?.decidedBy, entry?.note]);

  const chosen = decision.options.find((o) => o.id === entry?.optionId);
  const canRecord = recording === 'on';

  return (
    <section id={decision.id} className="flows-flow" aria-label={decision.title}>
      <Card
        title={`D${number}. ${decision.title}`}
        action={
          chosen ? <Badge tone="success">Decided</Badge> : <Badge tone="warning">Open</Badge>
        }
      >
        <p className="flows-question">{decision.question}</p>
        <p className="flows-context">{decision.context}</p>

        {chosen && entry && (
          <p className="flows-decided">
            <strong>Decided: {chosen.label}</strong>
            <span className="flows-decided-meta">
              {entry.decidedBy ? `by ${entry.decidedBy} · ` : ''}
              {formatDecidedAt(entry.updatedAt)}
            </span>
            {entry.note && <span className="flows-decided-note">{entry.note}</span>}
          </p>
        )}

        <div className="flows-options">
          {decision.options.map((option) => {
            const isChosen = option.id === chosen?.id;
            const classes = [
              'flows-option',
              option.status === 'proposed' ? 'flows-option--proposed' : null,
              isChosen ? 'flows-option--chosen' : null,
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <article key={option.id} className={classes} aria-label={option.label}>
                <header className="flows-option-head">
                  <h4>{option.label}</h4>
                  <span className="flows-option-badges">
                    {isChosen && <Badge tone="success">Chosen</Badge>}
                    {option.status && (
                      <Badge tone={STATUS_BADGE[option.status].tone}>
                        {STATUS_BADGE[option.status].label}
                      </Badge>
                    )}
                  </span>
                </header>
                <p>{option.description}</p>
                <dl className="flows-option-facts">
                  <dt>Mother</dt>
                  <dd>{option.mother}</dd>
                  <dt>Business</dt>
                  <dd>{option.business}</dd>
                  {option.example && (
                    <>
                      <dt>Example</dt>
                      <dd>{option.example}</dd>
                    </>
                  )}
                </dl>
                {canRecord && !isChosen && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flows-option-pick"
                    onClick={() => setOptionId(option.id)}
                    aria-label={`Pick “${option.label}” for ${decision.title}`}
                  >
                    {optionId === option.id ? 'Picked — save below' : 'Pick this'}
                  </Button>
                )}
              </article>
            );
          })}
        </div>

        {canRecord && (
          <form
            className="flows-record"
            aria-label={`Record the decision: ${decision.title}`}
            onSubmit={(event) => {
              event.preventDefault();
              if (optionId === NO_OPTION) return;
              onSave({ optionId, decidedBy: decidedBy.trim(), note: note.trim() });
            }}
          >
            <Field label="Decision">
              <Select
                value={optionId}
                aria-label={`Decision for ${decision.title}`}
                placeholder="Pick an option"
                options={[
                  { value: NO_OPTION, label: 'Not decided yet' },
                  ...decision.options.map((o) => ({ value: o.id, label: o.label })),
                ]}
                onChange={setOptionId}
              />
            </Field>
            <Field label="Decided by">
              <input
                type="text"
                maxLength={40}
                value={decidedBy}
                placeholder="Your name or initials"
                onChange={(event) => setDecidedBy(event.target.value)}
              />
            </Field>
            <Field label="Note" hint="Why, or any condition attached — e.g. a percentage or a limit.">
              <textarea
                className="qa-note"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <div className="flows-record-actions">
              <Button type="submit" size="sm" disabled={saving || optionId === NO_OPTION}>
                {saving ? 'Saving…' : chosen ? 'Update decision' : 'Record decision'}
              </Button>
              {chosen && (
                <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onClear}>
                  Re-open
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>
    </section>
  );
}
