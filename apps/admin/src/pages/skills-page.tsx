import { useQuery } from '@tanstack/react-query';

import { Feedback, PageHeader } from '@admin/components/ui';
import { SkillForm } from '@admin/features/skills/skill-form';
import { SkillTable } from '@admin/features/skills/skill-table';
import { fetchSkills } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

export function SkillsPage() {
  const { data: skills, isLoading, error } = useQuery({
    queryKey: ['skills'],
    queryFn: fetchSkills,
  });

  return (
    <section>
      <PageHeader
        title="Skills"
        subtitle="Curate the specialties nannies can be tagged with (e.g. French speaker, works with disabilities). Assign them to nannies from the New Nannies page."
      />
      <SkillForm />
      {isLoading && <p>Loading skills…</p>}
      {error != null && <Feedback tone="error">{apiErrorMessage(error)}</Feedback>}
      {skills && <SkillTable skills={skills} />}
    </section>
  );
}
