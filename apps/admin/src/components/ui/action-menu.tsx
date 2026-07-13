import type { ReactNode } from 'react';

import { ICON_SIZE, MoreVertical } from './icon';
import { Menu } from './menu';

type ActionMenuProps = {
  /** Accessible label, e.g. "Actions for Sandra Weber's booking". */
  label: string;
  /** MenuItem / MenuSeparator children. */
  children: ReactNode;
  disabled?: boolean;
};

/**
 * Kebab (⋮) row-action menu for tables. Wraps Menu with a plain icon trigger.
 * Replaces stacks of inline Approve / Reject / Edit buttons.
 */
export function ActionMenu({ label, children, disabled }: ActionMenuProps) {
  if (disabled) {
    return (
      <button type="button" className="icon-btn icon-btn--plain" aria-label={label} disabled>
        <MoreVertical size={ICON_SIZE.menu} />
      </button>
    );
  }
  return (
    <Menu
      triggerLabel={label}
      triggerClassName="icon-btn icon-btn--plain"
      placement="bottom-end"
      trigger={<MoreVertical size={ICON_SIZE.menu} />}
    >
      {children}
    </Menu>
  );
}
