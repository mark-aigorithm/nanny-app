import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ICON_SIZE, PageHeader, Plus } from '@admin/components/ui';
import { GroupFormModal } from '@admin/features/groups/group-form';
import { GroupTable } from '@admin/features/groups/group-table';
import { useCanManage } from '@admin/lib/permissions';

/**
 * Groups of mothers — hand-picked (static) or matched by rules (dynamic). Its
 * own section so Surveys and Notifications can both send to a group.
 */
export function GroupsPage() {
  const canManage = useCanManage('groups');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <PageHeader
        title="Groups"
        subtitle="Lists of mothers to send surveys and notifications to: hand-picked, or matched by rules."
        action={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              New group
            </Button>
          )
        }
      />
      <GroupTable />
      {creating && (
        <GroupFormModal onClose={() => setCreating(false)} onSaved={(group) => navigate(`/groups/${group.id}`)} />
      )}
    </section>
  );
}
