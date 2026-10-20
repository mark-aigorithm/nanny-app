import type { NotificationTemplate, NotificationTemplateInput } from '@nanny-app/shared';
import { useQuery } from '@tanstack/react-query';

import { Badge, ErrorState, Skeleton } from '@admin/components/ui';
import { GROUP_KIND_LABEL, GROUP_KIND_TONE } from '@admin/features/groups/group-labels';
import { fetchUserGroups } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

import { formatCount, mothersLabel } from './notification-labels';
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

/** Groups to send to. (Task 11 adds "Specific mothers", the live count and Save-as-group.) */
export function TemplateAudienceFields({ value, onChange, saved, readOnly, disabled = false, error, errorId }: TemplateAudienceFieldsProps) {
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchUserGroups, enabled: !readOnly });
  if (readOnly) return <SavedAudience value={value} saved={saved} />;

  const groupIds = value.type === 'GROUPS' ? value.groupIds : [];
  const toggle = (id: number) =>
    onChange({
      type: 'GROUPS',
      groupIds: groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id],
    });

  return (
    <fieldset
      className="audience-groups"
      id={TEMPLATE_FIELD_ID.audience}
      tabIndex={-1}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="sr-only">Groups</legend>
      {groups.isPending && (
        <>
          <span className="sr-only">Loading groups…</span>
          <Skeleton width="12rem" height="1.25rem" />
          <Skeleton width="10rem" height="1.25rem" />
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
      {(groups.data ?? []).map((g) => (
        <label key={g.id} className="audience-group">
          <input type="checkbox" disabled={disabled} checked={groupIds.includes(g.id)} onChange={() => toggle(g.id)} />
          <span className="audience-group-name">{g.name}</span>
        </label>
      ))}
      {groups.data?.length === 0 && <p className="field-hint">No groups yet. Create one on the Groups page.</p>}
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </fieldset>
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
  const shown = value.motherIds.slice(0, 8).map((id) => names.get(id) ?? `Mother #${id}`);
  const more = value.motherIds.length - shown.length;
  return (
    <p className="audience-saved-mothers">
      {mothersLabel(value.motherIds.length)}: {shown.join(', ')}
      {more > 0 ? `, and ${formatCount(more)} more` : ''}
    </p>
  );
}
