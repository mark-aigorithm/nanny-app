import type { QaScenario } from '@nanny-app/shared';

import { Button, Field, ICON_SIZE, TriangleAlert } from '@admin/components/ui';

export type QaDraft = { note: string; tester: string };

type Props = {
  scenario: QaScenario;
  /** Seeds the fields; not re-read as they are typed into. */
  draft: QaDraft;
  saving: boolean;
  /** One field at a time — the page merges it into what it already holds. */
  onChange: (patch: Partial<QaDraft>) => void;
  onCommit: () => void;
};

/**
 * The expanded half of a scenario row: how to run it, what should happen, and
 * where the tester records what actually did.
 *
 * The note and tester fields are **uncontrolled**, seeded from `draft` and
 * reported upward on every keystroke. Two reasons, and both matter here:
 *
 *  - The page has to know what is typed *before* it is saved, because picking a
 *    result must carry the half-typed note into that same write. State owned
 *    here could not survive the re-render that picking one causes.
 *  - Holding it as page state instead would re-render all hundred-odd rows on
 *    every keystroke, which is felt on the machine a tester is actually using.
 *    The page keeps it in a ref, so typing costs nothing.
 *
 * They save on blur rather than per keystroke — a debounce would fire a write
 * mid-sentence, and with several people on one checklist the last partial
 * sentence to land would win.
 */
export function QaScenarioDetail({ scenario, draft, saving, onChange, onCommit }: Props) {
  return (
    <div className="qa-detail">
      {scenario.knownGap && (
        <p className="qa-known-gap">
          <TriangleAlert size={ICON_SIZE.inline} aria-hidden />
          <span>{scenario.knownGap}</span>
        </p>
      )}

      <div className="qa-detail-grid">
        <section className="qa-detail-block">
          <h4 className="qa-detail-heading">Before you start</h4>
          <ul className="qa-list">
            {scenario.preconditions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="qa-detail-block">
          <h4 className="qa-detail-heading">Steps</h4>
          <ol className="qa-list qa-list--ordered">
            {scenario.steps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>

        <section className="qa-detail-block">
          <h4 className="qa-detail-heading">What should happen</h4>
          <ul className="qa-list qa-list--check">
            {scenario.expected.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="qa-detail-record">
        <Field
          label="What happened"
          hint="Anything worth passing to the team — a device, a screenshot name, the error you saw."
        >
          <textarea
            className="qa-note"
            rows={3}
            maxLength={500}
            defaultValue={draft.note}
            placeholder="Leave blank if it behaved exactly as described."
            onChange={(event) => onChange({ note: event.target.value })}
            onBlur={onCommit}
          />
        </Field>
        <Field label="Tested by">
          <input
            type="text"
            maxLength={40}
            defaultValue={draft.tester}
            placeholder="Your name or initials"
            onChange={(event) => onChange({ tester: event.target.value })}
            onBlur={onCommit}
          />
        </Field>
        <div className="qa-detail-save">
          <Button size="sm" variant="ghost" onClick={onCommit} disabled={saving}>
            {saving ? 'Saving…' : 'Save notes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
