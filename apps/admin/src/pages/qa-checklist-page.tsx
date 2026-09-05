import { useMemo, useRef, useState } from 'react';

import {
  QA_AREAS,
  QA_PRIORITIES,
  QA_SCENARIOS,
  QA_STATUSES,
  QA_SURFACES,
  type QaArea,
  type QaPriority,
  type QaScenario,
  type QaStatus,
  type QaSurface,
} from '@nanny-app/shared';

import {
  Badge,
  Button,
  Card,
  ChevronDown,
  ChevronRight,
  ConfirmDialog,
  ErrorState,
  FilterSelect,
  ICON_SIZE,
  Input,
  Select,
  Table,
  TableSkeleton,
  TriangleAlert,
  useToast,
  type Column,
} from '@admin/components/ui';
import { QaProgress, type QaCounts } from '@admin/features/qa/qa-progress';
import { QaScenarioDetail, type QaDraft } from '@admin/features/qa/qa-scenario-detail';
import {
  useQaChecklist,
  useResetQaChecklist,
  useSetQaScenarioStatus,
} from '@admin/features/qa/use-qa-checklist';
import { apiErrorMessage } from '@admin/lib/api-error';

const ANY = 'ANY';

const STATUS_LABELS: Record<QaStatus, string> = {
  NOT_RUN: 'Not run',
  PASS: 'Pass',
  FAIL: 'Fail',
  BLOCKED: 'Blocked',
};

const STATUS_TONE: Record<QaStatus, 'neutral' | 'success' | 'danger' | 'warning'> = {
  NOT_RUN: 'neutral',
  PASS: 'success',
  FAIL: 'danger',
  BLOCKED: 'warning',
};

/** A scenario with its display number and whatever has been recorded for it. */
type Row = {
  scenario: QaScenario;
  number: number;
  status: QaStatus;
};

/**
 * The manual release-test checklist, open without an account.
 *
 * It is a sibling of /login rather than a section of the console: the people
 * walking the release test are the business team, who have no admin login, and
 * a section would need one. So it renders outside RequireAuth, outside the
 * permissions provider and outside AdminLayout — hence its own header instead
 * of the sidebar chrome.
 */
export function QaChecklistPage() {
  const toast = useToast();
  const { data, isLoading, error, refetch, isFetching } = useQaChecklist();
  const setStatus = useSetQaScenarioStatus();
  const reset = useResetQaChecklist();

  const [area, setArea] = useState<QaArea | typeof ANY>(ANY);
  const [surface, setSurface] = useState<QaSurface | typeof ANY>(ANY);
  const [priority, setPriority] = useState<QaPriority | typeof ANY>(ANY);
  const [status, setStatusFilter] = useState<QaStatus | typeof ANY>(ANY);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmingReset, setConfirmingReset] = useState(false);
  /**
   * What is typed into a scenario's note and tester fields but not yet saved.
   *
   * A ref, not state: it has to be readable when a result is picked — so the
   * half-typed note goes into that same write instead of being lost to the
   * re-render — but nothing on screen depends on it changing, and holding it as
   * state would re-render all hundred-odd rows on every keystroke.
   */
  const draftsRef = useRef<Record<string, QaDraft>>({});

  const entries = data?.entries ?? {};

  function draftFor(scenarioId: string): QaDraft {
    const entry = entries[scenarioId];
    return draftsRef.current[scenarioId] ?? { note: entry?.note ?? '', tester: entry?.tester ?? '' };
  }

  /** Every scenario with its number, which is its position in the catalogue. */
  const allRows = useMemo<Row[]>(
    () =>
      QA_SCENARIOS.map((scenario, index) => ({
        scenario,
        number: index + 1,
        status: entries[scenario.id]?.status ?? 'NOT_RUN',
      })),
    [entries],
  );

  const counts = useMemo<QaCounts>(() => {
    const base: QaCounts = { NOT_RUN: 0, PASS: 0, FAIL: 0, BLOCKED: 0, total: allRows.length };
    for (const row of allRows) base[row.status] += 1;
    return base;
  }, [allRows]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allRows.filter(({ scenario, status: rowStatus }) => {
      if (area !== ANY && scenario.area !== area) return false;
      if (surface !== ANY && scenario.surface !== surface) return false;
      if (priority !== ANY && scenario.priority !== priority) return false;
      if (status !== ANY && rowStatus !== status) return false;
      if (needle === '') return true;
      // Search the steps too — a tester looking for "promo code" should find
      // the scenario that mentions it in a step, not only in its title.
      return [scenario.title, scenario.area, ...scenario.steps, ...scenario.expected]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [allRows, area, surface, priority, status, search]);

  const filtered = rows.length !== allRows.length;

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Writes a result. Always sends the current draft alongside the status, so a
   * note typed but not yet blurred is saved by the same call rather than lost
   * to the re-render that picking a result causes.
   */
  function record(scenario: QaScenario, next: QaStatus) {
    const draft = draftFor(scenario.id);
    setStatus.mutate(
      { scenarioId: scenario.id, input: { status: next, ...draft } },
      { onError: (err) => toast.error(apiErrorMessage(err)) },
    );
  }

  const columns: Column<Row>[] = [
    {
      key: 'number',
      header: '#',
      nowrap: true,
      render: (row) => <span className="qa-number">{row.number}</span>,
    },
    {
      key: 'scenario',
      header: 'Scenario',
      render: (row) => (
        <button
          type="button"
          className="qa-title-button"
          aria-expanded={expanded.has(row.scenario.id)}
          onClick={() => toggle(row.scenario.id)}
        >
          <span className="qa-title-chevron" aria-hidden>
            {expanded.has(row.scenario.id) ? (
              <ChevronDown size={ICON_SIZE.inline} />
            ) : (
              <ChevronRight size={ICON_SIZE.inline} />
            )}
          </span>
          <span className="qa-title-text">
            <span className="qa-title">
              {row.scenario.title}
              {row.scenario.knownGap && (
                <span className="qa-gap-flag" title="Known gap — see the details">
                  <TriangleAlert size={ICON_SIZE.inline} />
                </span>
              )}
            </span>
            <span className="qa-tags">
              <Badge>{row.scenario.area}</Badge>
              <Badge>{row.scenario.surface}</Badge>
              <Badge tone={row.scenario.priority === 'P0' ? 'warning' : 'neutral'}>
                {row.scenario.priority}
              </Badge>
              {row.scenario.negative && <Badge>Refusal case</Badge>}
            </span>
          </span>
        </button>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      nowrap: true,
      render: (row) => (
        // Not the `compact` variant the bookings console uses: that one
        // capitalizes every word, which would render "Not run" as "Not Run".
        <div className="row-control qa-result-control">
          <Select
            value={row.status}
            aria-label={`Result for scenario ${row.number}`}
            options={QA_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))}
            onChange={(next) => record(row.scenario, next)}
          />
        </div>
      ),
    },
    {
      key: 'by',
      header: 'By',
      nowrap: true,
      render: (row) => {
        const entry = entries[row.scenario.id];
        if (!entry || entry.status === 'NOT_RUN') return <span className="qa-muted">—</span>;
        return (
          <span className="qa-by">
            <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
            {entry.tester && <span className="qa-by-name">{entry.tester}</span>}
          </span>
        );
      },
    },
  ];

  return (
    <div className="qa-page">
      <div className="qa-shell">
        <header className="qa-header">
          <div>
            <h1 className="admin-logo">
              NannyNow <span>Release test</span>
            </h1>
            <p className="qa-subtitle">
              Every journey in the app, ordered by how often it happens in real life. Walk them in
              order and record what you find — anyone with this link can tick a row, and everyone
              sees the same board.
            </p>
          </div>
          <div className="qa-header-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setExpanded(
                  expanded.size === 0 ? new Set(QA_SCENARIOS.map((s) => s.id)) : new Set(),
                )
              }
            >
              {expanded.size === 0 ? 'Expand all' : 'Collapse all'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(true)}>
              Start a new round
            </Button>
          </div>
        </header>

        <QaProgress counts={counts} loading={isLoading} />

        <div className="filter-bar qa-filter-bar">
          <FilterSelect
            label="Area"
            value={area}
            onChange={(value) => setArea(value as QaArea | typeof ANY)}
            options={[
              { value: ANY, label: 'All areas' },
              ...QA_AREAS.map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label="Where"
            value={surface}
            onChange={(value) => setSurface(value as QaSurface | typeof ANY)}
            options={[
              { value: ANY, label: 'Everywhere' },
              ...QA_SURFACES.map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label="Priority"
            value={priority}
            onChange={(value) => setPriority(value as QaPriority | typeof ANY)}
            options={[
              { value: ANY, label: 'All' },
              ...QA_PRIORITIES.map((value) => ({
                value,
                label: value === 'P0' ? 'P0 — must ship green' : value,
              })),
            ]}
          />
          <FilterSelect
            label="Result"
            value={status}
            onChange={(value) => setStatusFilter(value as QaStatus | typeof ANY)}
            options={[
              { value: ANY, label: 'Any result' },
              ...QA_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
            ]}
          />
          <div className="qa-search">
            <Input
              type="search"
              value={search}
              placeholder="Search scenarios…"
              aria-label="Search scenarios"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {isLoading && <TableSkeleton columns={4} />}

        {error != null && !data && (
          <ErrorState
            title="We couldn’t load the checklist"
            message={apiErrorMessage(error)}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        )}

        {data && (
          <>
            {filtered && (
              <p className="qa-filter-summary">
                Showing {rows.length} of {allRows.length} scenarios.
              </p>
            )}
            <Table
              columns={columns}
              rows={rows}
              rowKey={(row) => row.scenario.id}
              empty="No scenarios match these filters."
              renderExpanded={(row) =>
                expanded.has(row.scenario.id) ? (
                  <QaScenarioDetail
                    scenario={row.scenario}
                    draft={draftFor(row.scenario.id)}
                    saving={setStatus.isPending}
                    onChange={(patch) => {
                      draftsRef.current[row.scenario.id] = {
                        ...draftFor(row.scenario.id),
                        ...patch,
                      };
                    }}
                    onCommit={() => record(row.scenario, row.status)}
                  />
                ) : null
              }
            />
          </>
        )}

        <footer className="qa-footer">
          <Card>
            <p className="qa-footer-text">
              This board is for the release test only — it holds no customer data. Results are saved
              on the server as soon as you pick one, so several people can walk different sections
              at the same time.
            </p>
          </Card>
        </footer>
      </div>

      {confirmingReset && (
        <ConfirmDialog
          danger
          title="Start a new test round?"
          message="This clears every result, note and name on the board for everyone. The scenarios themselves are not affected."
          confirmLabel="Clear the board"
          busy={reset.isPending}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: (cleared) => {
                setConfirmingReset(false);
                // Unsaved drafts belong to the round that was just cleared, and
                // the fields are uncontrolled — so collapse everything too, and
                // let expanding a row build it again from an empty board.
                draftsRef.current = {};
                setExpanded(new Set());
                toast.success(`Cleared ${cleared} result${cleared === 1 ? '' : 's'}.`);
              },
              onError: (err) => {
                setConfirmingReset(false);
                toast.error(apiErrorMessage(err));
              },
            })
          }
        />
      )}
    </div>
  );
}
