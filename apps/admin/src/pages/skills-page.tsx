import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  Button,
  ErrorState,
  ICON_SIZE,
  PageHeader,
  Plus,
  StaleRefreshBanner,
  TableSkeleton,
} from '@admin/components/ui';
import { SkillFormModal } from '@admin/features/skills/skill-form';
import { SkillTable } from '@admin/features/skills/skill-table';
import { fetchSkills } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

export function SkillsPage() {
  const canManage = useCanManage('skills');
  const [adding, setAdding] = useState(false);
  const {
    data: skills,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  });

  return (
    <section>
      <PageHeader
        title="Nanny Skills"
        subtitle="Curate the specialties nannies can be tagged with (e.g. French speaker, works with disabilities). Assign them to nannies from the New Nannies page."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={ICON_SIZE.inline} aria-hidden />
              Add skill
            </Button>
          )
        }
      />
      {isLoading && <TableSkeleton columns={4} />}
      {error != null && !skills && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {skills && (
        <>
          {error != null && (
            <StaleRefreshBanner
              message={apiErrorMessage(error)}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          )}
          <SkillTable skills={skills} />
        </>
      )}
      {adding && <SkillFormModal onClose={() => setAdding(false)} />}
    </section>
  );
}
