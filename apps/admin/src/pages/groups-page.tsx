import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, ICON_SIZE, PageHeader, Plus } from '@admin/components/ui';
import { GroupFormModal } from '@admin/features/groups/group-form';
import { GroupTable } from '@admin/features/groups/group-table';
import { useCanManage } from '@admin/lib/permissions';

/**
 * Hand-picked groups of mothers. Its own console section so other features
 * (Surveys today, the notification center later) can send to a group.
 */
export function GroupsPage() {
  const canManage = useCanManage('groups');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <section>
      <PageHeader
        title="Groups"
        subtitle="Hand-picked lists of mothers to send surveys and messages to."
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
