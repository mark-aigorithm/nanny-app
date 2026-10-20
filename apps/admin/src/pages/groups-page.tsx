import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, DetailHeader, ICON_SIZE, PageHeader, Plus } from '@admin/components/ui';
import { GroupFormModal } from '@admin/features/groups/group-form';
import { GroupTable } from '@admin/features/groups/group-table';
import { useCanManage, usePermissions } from '@admin/lib/permissions';

const TITLE = 'Groups';
const SUBTITLE =
  'Lists of mothers to send surveys and notifications to: hand-picked, or matched by rules.';

/**
 * Groups of mothers — hand-picked (static) or matched by rules (dynamic). Its
 * own section so Surveys and Notifications can both send to a group. Opened
 * from the Users page's "Manage groups", so it leads back there.
 */
export function GroupsPage() {
  const canManage = useCanManage('groups');
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newGroup = canManage && (
    <Button onClick={() => setCreating(true)}>
      <Plus size={ICON_SIZE.inline} aria-hidden />
      New group
    </Button>
  );

  return (
    <section>
      {can('users', 'VIEW') ? (
        <DetailHeader
          title={TITLE}
          subtitle={SUBTITLE}
          backTo="/users"
          backLabel="Users"
          actions={newGroup}
        />
      ) : (
        <PageHeader title={TITLE} subtitle={SUBTITLE} action={newGroup} />
      )}
      <GroupTable />
      {creating && (
        <GroupFormModal
          onClose={() => setCreating(false)}
          onSaved={(group) => navigate(`/groups/${group.id}`)}
        />
      )}
    </section>
  );
}
