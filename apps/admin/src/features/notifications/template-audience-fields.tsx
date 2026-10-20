import type {
  MotherPickerRow,
  NotificationTemplate,
  NotificationTemplateInput,
  UserGroup,
} from '@nanny-app/shared';
import { NOTIFICATION_AUDIENCE_MAX_GROUPS, NOTIFICATION_AUDIENCE_MAX_MOTHERS } from '@nanny-app/shared';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useId, useState } from 'react';

import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Modal,
  SegmentedControl,
  Skeleton,
  useToast,
  type SegmentedOption,
} from '@admin/components/ui';
import { GROUP_KIND_LABEL, GROUP_KIND_TONE } from '@admin/features/groups/group-labels';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import { fetchUserGroups, previewNotificationAudience } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { useDebouncedValue } from '@admin/lib/use-debounced-value';

import { formatCount, mothersLabel } from './notification-labels';
import { SaveAsGroupDialog } from './save-as-group-dialog';
import { TEMPLATE_FIELD_ID } from './template-issues';

export type AudienceValue = NotificationTemplateInput['audience'];
export type SavedAudienceNames = {
  groups: NotificationTemplate['audienceGroups'];
  mothers: NotificationTemplate['audienceMothers'];
};

export type TemplateAudienceFieldsProps = {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
  /** Names the saved template resolved — for read-only display and the chosen-mothers list. */
  saved: SavedAudienceNames;
  readOnly: boolean;
  /** Locked while a save is in flight (unlike readOnly, still the editable rendering). */
  disabled?: boolean;
  error?: string;
  errorId: string;
};

type Mode = AudienceValue['type'];

const MODE_OPTIONS: readonly SegmentedOption<Mode>[] = [
  { value: 'GROUPS', label: 'Groups' },
  { value: 'MOTHERS', label: 'Specific mothers' },
];

/** How many chosen mothers are named before "and N more". */
const NAMES_SHOWN = 8;

/**
 * Who gets the notification: one or more groups (static and dynamic, unioned)
 * or hand-picked mothers. A live count says how many it reaches and how many
 * of them have push turned on; hand-picked mothers can be saved as a group.
 */
export function TemplateAudienceFields({
  value,
  onChange,
  saved,
  readOnly,
  disabled = false,
  error,
  errorId,
}: TemplateAudienceFieldsProps) {
  const toast = useToast();
  const canManageGroups = useCanManage('groups');
  const groupsHintId = useId();
  // What the other mode held, so flipping Groups ⇄ Specific mothers mid-edit loses
  // nothing; only the active mode's list is ever part of the value (and saved).
  const [stash, setStash] = useState<{ groupIds: number[]; motherIds: number[] }>({ groupIds: [], motherIds: [] });
  // Names of the mothers seen so far (the saved template, then picker pages).
  const [names, setNames] = useState<ReadonlyMap<number, string>>(
    () => new Map(saved.mothers.map((m) => [m.id, m.name])),
  );
  const [choosing, setChoosing] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);

  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchUserGroups, enabled: !readOnly });

  // Ask for the count once the admin pauses, not on every tick.
  const debounced = useDebouncedValue(value, 400);
  const debouncedIds = debounced.type === 'GROUPS' ? debounced.groupIds : debounced.motherIds;
  const preview = useQuery({
    queryKey: ['notification-audience-preview', debounced],
    queryFn: () => previewNotificationAudience(debounced),
    enabled: !readOnly && debouncedIds.length > 0,
    placeholderData: keepPreviousData,
  });

  const rememberNames = useCallback(
    (rows: MotherPickerRow[]) =>
      setNames((prev) => {
        if (rows.every((r) => prev.get(r.id) === r.name)) return prev;
        const next = new Map(prev);
        for (const r of rows) next.set(r.id, r.name);
        return next;
      }),
    [],
  );

  if (readOnly) return <SavedAudience value={value} saved={saved} />;

  const ids = value.type === 'GROUPS' ? value.groupIds : value.motherIds;

  const switchMode = (mode: Mode) => {
    if (mode === value.type) return;
    if (value.type === 'GROUPS') {
      setStash((s) => ({ ...s, groupIds: value.groupIds }));
      onChange({ type: 'MOTHERS', motherIds: stash.motherIds });
    } else {
      setStash((s) => ({ ...s, motherIds: value.motherIds }));
      onChange({ type: 'GROUPS', groupIds: stash.groupIds });
    }
  };

  const switchToGroup = (group: UserGroup, motherIds: number[]) => {
    // The hand-picked list stays one click away under "Specific mothers".
    setStash((s) => ({ ...s, motherIds }));
    onChange({ type: 'GROUPS', groupIds: [group.id] });
  };

  const onGroupSaved = (group: UserGroup, motherIds: number[]) => {
    setSavingGroup(false);
    toast.toast({
      tone: 'success',
      title: 'Group created',
      message: `“${group.name}” has ${mothersLabel(motherIds.length)}.`,
      action: { label: 'Use this group instead', onClick: () => switchToGroup(group, motherIds) },
    });
  };

  const settled = debounced === value && !preview.isPlaceholderData;
  const countText =
    ids.length === 0
      ? 'Choose who gets this notification to see how many mothers it reaches.'
      : preview.isError
        ? 'We couldn’t count this audience.'
        : !preview.data || !settled
          ? 'Counting mothers…'
          : `${mothersLabel(preview.data.mothers)} · ${formatCount(preview.data.withPushDevice)} with push enabled`;

  return (
    <div className="audience-fields">
      <SegmentedControl
        legend="Send to"
        value={value.type}
        options={MODE_OPTIONS}
        onChange={switchMode}
        disabled={disabled}
      />

      {value.type === 'GROUPS' ? (
        <GroupChoices
          groups={groups}
          groupIds={value.groupIds}
          saved={saved}
          onChange={(groupIds) => onChange({ type: 'GROUPS', groupIds })}
          hintId={groupsHintId}
          errorId={error ? errorId : undefined}
          disabled={disabled}
        />
      ) : (
        <div
          className="audience-mothers"
          id={TEMPLATE_FIELD_ID.audience}
          tabIndex={-1}
          role="group"
          aria-label="Chosen mothers"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          {value.motherIds.length === 0 ? (
            <p className="field-hint">No mothers chosen yet.</p>
          ) : (
            <p className="audience-mothers-list">
              <strong>{mothersLabel(value.motherIds.length)}:</strong>{' '}
              {value.motherIds
                .slice(0, NAMES_SHOWN)
                .map((id) => names.get(id) ?? `Mother #${id}`)
                .join(', ')}
              {value.motherIds.length > NAMES_SHOWN
                ? `, and ${formatCount(value.motherIds.length - NAMES_SHOWN)} more`
                : ''}
            </p>
          )}
          <div className="audience-mothers-actions">
            <Button variant="ghost" onClick={() => setChoosing(true)} disabled={disabled}>
              {value.motherIds.length === 0 ? 'Choose mothers…' : 'Change selection…'}
            </Button>
            {canManageGroups && value.motherIds.length > 0 && (
              <Button variant="ghost" onClick={() => setSavingGroup(true)} disabled={disabled}>
                Save these {mothersLabel(value.motherIds.length)} as a static group
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}

      <div className="audience-count">
        <p role="status">{countText}</p>
        {preview.isError && (
          <Button variant="ghost" size="sm" onClick={() => void preview.refetch()}>
            Try again
          </Button>
        )}
      </div>

      {choosing && (
        <ChooseMothersModal
          initial={value.type === 'MOTHERS' ? value.motherIds : []}
          onRowsLoaded={rememberNames}
          onCancel={() => setChoosing(false)}
          onConfirm={(motherIds) => {
            setChoosing(false);
            onChange({ type: 'MOTHERS', motherIds });
          }}
        />
      )}
      {savingGroup && value.type === 'MOTHERS' && (
        <SaveAsGroupDialog
          motherIds={value.motherIds}
          onClose={() => setSavingGroup(false)}
          onSaved={(group) => onGroupSaved(group, value.motherIds)}
        />
      )}
    </div>
  );
}

type GroupChoicesProps = {
  groups: UseQueryResult<UserGroup[]>;
  groupIds: number[];
  saved: SavedAudienceNames;
  onChange: (groupIds: number[]) => void;
  hintId: string;
  errorId: string | undefined;
  disabled: boolean;
};

/** Every group as a checkbox: name, Static/Dynamic, and how many mothers it holds now. */
function GroupChoices({ groups, groupIds, saved, onChange, hintId, errorId, disabled }: GroupChoicesProps) {
  const atMax = groupIds.length >= NOTIFICATION_AUDIENCE_MAX_GROUPS;
  const toggle = (id: number) =>
    onChange(groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id]);
  const listed = new Set((groups.data ?? []).map((g) => g.id));
  // Chosen groups deleted since the template was saved: shown so they can be unticked.
  const missing = groups.data ? groupIds.filter((id) => !listed.has(id)) : [];
  const savedName = (id: number) => saved.groups.find((g) => g.id === id)?.name;

  return (
    <fieldset
      className="audience-groups"
      id={TEMPLATE_FIELD_ID.audience}
      tabIndex={-1}
      aria-invalid={errorId ? true : undefined}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ')}
    >
      <legend className="sr-only">Groups</legend>
      {groups.isPending && (
        <>
          <span className="sr-only">Loading groups…</span>
          <Skeleton width="14rem" height="1.25rem" />
          <Skeleton width="11rem" height="1.25rem" />
        </>
      )}
      {groups.isError && (
        <ErrorState
          title="We couldn’t load the groups"
          message={apiErrorMessage(groups.error)}
          onRetry={() => void groups.refetch()}
          retrying={groups.isFetching}
        />
      )}
      {(groups.data ?? []).map((g) => {
        const checked = groupIds.includes(g.id);
        return (
          <label key={g.id} className="audience-group">
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled || (!checked && atMax)}
              onChange={() => toggle(g.id)}
            />
            <span className="audience-group-name">{g.name}</span>
            <Badge tone={GROUP_KIND_TONE[g.kind]}>{GROUP_KIND_LABEL[g.kind]}</Badge>
            <span className="audience-group-count">
              {mothersLabel(g.memberCount)}
              {g.kind === 'DYNAMIC' ? ' now' : ''}
            </span>
          </label>
        );
      })}
      {missing.map((id) => (
        <label key={id} className="audience-group audience-group--missing">
          <input type="checkbox" checked disabled={disabled} onChange={() => toggle(id)} />
          <span className="audience-group-name">{savedName(id) ?? `Group #${id}`}</span>
          <span className="audience-group-count">Deleted. Untick it before saving.</span>
        </label>
      ))}
      {groups.data?.length === 0 && <p className="field-hint">No groups yet. Create one on the Groups page.</p>}
      <p className="field-hint" id={hintId}>
        A mother in several chosen groups gets it once. Dynamic groups are worked out when you publish. Up to{' '}
        {NOTIFICATION_AUDIENCE_MAX_GROUPS} groups.
      </p>
    </fieldset>
  );
}

type ChooseMothersModalProps = {
  initial: number[];
  onRowsLoaded: (rows: MotherPickerRow[]) => void;
  onCancel: () => void;
  onConfirm: (motherIds: number[]) => void;
};

/** The mother picker in a dialog; ticks survive paging and searching. */
function ChooseMothersModal({ initial, onRowsLoaded, onCancel, onConfirm }: ChooseMothersModalProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial));
  const [discarding, setDiscarding] = useState(false);
  const changed = selected.size !== initial.length || initial.some((id) => !selected.has(id));
  const over = selected.size > NOTIFICATION_AUDIENCE_MAX_MOTHERS;
  // Ticks across pages are real work: ask before Escape or Cancel drops them.
  const requestClose = () => (changed ? setDiscarding(true) : onCancel());

  return (
    <Modal
      title="Choose mothers"
      size="lg"
      onClose={requestClose}
      dismissible={!changed}
      footer={
        <>
          <span className="recipient-summary" aria-live="polite">
            {over
              ? `${formatCount(selected.size)} ticked. Choose at most ${formatCount(NOTIFICATION_AUDIENCE_MAX_MOTHERS)}.`
              : `${mothersLabel(selected.size)} chosen.`}
          </span>
          <Button variant="ghost" onClick={requestClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm([...selected].sort((a, b) => a - b))} disabled={over || !changed}>
            {selected.size === 0 ? 'Clear the selection' : `Use ${mothersLabel(selected.size)}`}
          </Button>
        </>
      }
    >
      <MotherPickerTable selected={selected} onSelectedChange={setSelected} onRowsLoaded={onRowsLoaded} />
      {discarding && (
        <ConfirmDialog
          title="Discard your selection?"
          message="The mothers you ticked or unticked here won’t be used."
          confirmLabel="Discard"
          cancelLabel="Keep picking"
          danger
          onConfirm={onCancel}
          onCancel={() => setDiscarding(false)}
        />
      )}
    </Modal>
  );
}

/** The saved audience by name, for an admin who can't change it. */
export function SavedAudience({ value, saved }: { value: AudienceValue; saved: SavedAudienceNames }) {
  if (value.type === 'GROUPS') {
    const byId = new Map(saved.groups.map((g) => [g.id, g]));
    return (
      <ul className="audience-saved">
        {value.groupIds.map((id) => {
          const group = byId.get(id);
          return (
            <li key={id}>
              <span>{group?.name ?? `Group #${id} (deleted)`}</span>
              {group && <Badge tone={GROUP_KIND_TONE[group.kind]}>{GROUP_KIND_LABEL[group.kind]}</Badge>}
            </li>
          );
        })}
      </ul>
    );
  }
  const names = new Map(saved.mothers.map((m) => [m.id, m.name]));
  const shown = value.motherIds.slice(0, NAMES_SHOWN).map((id) => names.get(id) ?? `Mother #${id}`);
  const more = value.motherIds.length - shown.length;
  return (
    <p className="audience-saved-mothers">
      {mothersLabel(value.motherIds.length)}: {shown.join(', ')}
      {more > 0 ? `, and ${formatCount(more)} more` : ''}
    </p>
  );
}
