import type { QaStatus } from '@nanny-app/shared';

import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleOff,
  ClipboardList,
  ICON_SIZE,
  StatCard,
} from '@admin/components/ui';

export type QaCounts = Record<QaStatus, number> & { total: number };

function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/**
 * How far the release test has got. The bar is the headline — a stakeholder
 * wants "are we nearly done, and is anything broken" before they want any
 * individual row.
 */
export function QaProgress({ counts, loading }: { counts: QaCounts; loading?: boolean }) {
  // Invalid counts as run: someone looked at it and reached a verdict, even
  // if the verdict is about the scenario rather than the app.
  const run = counts.PASS + counts.FAIL + counts.BLOCKED + counts.INVALID;

  return (
    <div className="qa-progress">
      <div
        className="qa-progress-bar"
        role="img"
        aria-label={`${run} of ${counts.total} scenarios run — ${counts.PASS} passed, ${counts.FAIL} failed, ${counts.BLOCKED} blocked, ${counts.INVALID} invalid`}
      >
        {/* Segment widths are computed, which is the one legitimate inline
            style; the colours themselves are tokens in global.css. */}
        <span
          className="qa-progress-fill qa-progress-fill--pass"
          style={{ width: `${percent(counts.PASS, counts.total)}%` }}
        />
        <span
          className="qa-progress-fill qa-progress-fill--fail"
          style={{ width: `${percent(counts.FAIL, counts.total)}%` }}
        />
        <span
          className="qa-progress-fill qa-progress-fill--blocked"
          style={{ width: `${percent(counts.BLOCKED, counts.total)}%` }}
        />
        <span
          className="qa-progress-fill qa-progress-fill--invalid"
          style={{ width: `${percent(counts.INVALID, counts.total)}%` }}
        />
      </div>

      <div className="qa-stat-row">
        <StatCard
          label="Run"
          value={`${run} / ${counts.total}`}
          hint={`${percent(run, counts.total)}% of the catalogue`}
          icon={<ClipboardList size={ICON_SIZE.stat} />}
          loading={loading}
        />
        <StatCard
          label="Passed"
          value={counts.PASS}
          icon={<CircleCheck size={ICON_SIZE.stat} />}
          loading={loading}
        />
        <StatCard
          label="Failed"
          value={counts.FAIL}
          iconTone="gold"
          hint={counts.FAIL > 0 ? 'Needs a fix before release' : undefined}
          icon={<CircleAlert size={ICON_SIZE.stat} />}
          loading={loading}
        />
        <StatCard
          label="Blocked"
          value={counts.BLOCKED}
          iconTone="bronze"
          hint={counts.BLOCKED > 0 ? 'Could not be tested' : undefined}
          icon={<Ban size={ICON_SIZE.stat} />}
          loading={loading}
        />
        <StatCard
          label="Invalid"
          value={counts.INVALID}
          iconTone="muted"
          hint={counts.INVALID > 0 ? 'Scenario needs rewriting' : undefined}
          icon={<CircleOff size={ICON_SIZE.stat} />}
          loading={loading}
        />
      </div>
    </div>
  );
}
