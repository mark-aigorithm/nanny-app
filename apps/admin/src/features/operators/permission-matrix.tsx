import type { AdminAccessLevel, AdminSection, OperatorPermissions } from '@nanny-app/shared';
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS } from '@nanny-app/shared';

import { Button } from '@admin/components/ui';

/** The three choices per section, in escalating order. */
const LEVELS: { value: AdminAccessLevel; label: string; hint: string }[] = [
  { value: 'NONE', label: 'No access', hint: 'The section is hidden entirely.' },
  { value: 'VIEW', label: 'View', hint: 'Can open and read, but not change anything.' },
  { value: 'MANAGE', label: 'Manage', hint: 'Can create, edit and act on records.' },
];

type Props = {
  value: OperatorPermissions;
  onChange: (next: OperatorPermissions) => void;
  disabled?: boolean;
};

/**
 * One row per section, three radios per row. This is the whole definition of an
 * operator's reach — what's selected here is what the API will enforce, so the
 * wording matches the sidebar labels exactly.
 */
export function PermissionMatrix({ value, onChange, disabled }: Props) {
  const setAll = (level: AdminAccessLevel) => {
    onChange(
      Object.fromEntries(ADMIN_SECTIONS.map((section) => [section, level])) as OperatorPermissions,
    );
  };

  const setSection = (section: AdminSection, level: AdminAccessLevel) => {
    onChange({ ...value, [section]: level });
  };

  return (
    <div className="perm-matrix">
      <div className="perm-matrix-toolbar">
        <span className="perm-matrix-hint">
          Manage includes everything View allows. Sections left at “No access” never appear for this
          operator.
        </span>
        <div className="row-actions">
          <Button type="button" variant="ghost" size="sm" onClick={() => setAll('VIEW')} disabled={disabled}>
            All view
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAll('NONE')} disabled={disabled}>
            Clear all
          </Button>
        </div>
      </div>

      <ul className="perm-matrix-list">
        {ADMIN_SECTIONS.map((section) => {
          const current = value[section] ?? 'NONE';
          return (
            <li className="perm-row" key={section}>
              <span className="perm-row-label">{ADMIN_SECTION_LABELS[section]}</span>
              <div
                className="perm-row-choices"
                role="radiogroup"
                aria-label={`Access to ${ADMIN_SECTION_LABELS[section]}`}
              >
                {LEVELS.map((level) => (
                  <label
                    key={level.value}
                    className={`perm-choice${current === level.value ? ' perm-choice--on' : ''}`}
                    title={level.hint}
                  >
                    <input
                      type="radio"
                      name={`perm-${section}`}
                      value={level.value}
                      checked={current === level.value}
                      disabled={disabled}
                      onChange={() => setSection(section, level.value)}
                    />
                    {level.label}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
