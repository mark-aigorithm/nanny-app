import { useQuery } from '@tanstack/react-query';

import { ErrorState, PageHeader, TableSkeleton } from '@admin/components/ui';
import { SkillForm } from '@admin/features/skills/skill-form';
import { SkillTable } from '@admin/features/skills/skill-table';
import { fetchSkills } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function SkillsPage() {
  const { data: skills, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  });

  return (
    <section>
      <PageHeader
        title="Nanny Skills"
        subtitle="Curate the specialties nannies can be tagged with (e.g. French speaker, works with disabilities). Assign them to nannies from the New Nannies page."
      />
      <SkillForm />
      {isLoading && <TableSkeleton columns={4} />}
      {error != null && (
        <ErrorState
          message={apiErrorMessage(error)}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      )}
      {skills && <SkillTable skills={skills} />}
    </section>
  );
}
