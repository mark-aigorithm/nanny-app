import type { AdminSurvey } from '@nanny-app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, ConfirmDialog, DetailHeader, StatCard, Tabs, useToast } from '@admin/components/ui';
import { closeSurvey, duplicateSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';

import { SURVEY_STATUS_LABEL, SURVEY_STATUS_TONE, responseRate } from './survey-labels';
import { SurveyRecipients } from './survey-recipients';
import { SurveyResults } from './survey-results';

type Tab = 'results' | 'recipients';

/** A published or closed survey: counts, actions, and the Results | Recipients tabs. */
export function SurveyDetail({ survey }: { survey: AdminSurvey }) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = useCanManage('surveys');
  const [tab, setTab] = useState<Tab>('results');
  const [closing, setClosing] = useState(false);
  const open = survey.status === 'PUBLISHED';

  const close = useMutation({
    mutationFn: () => closeSurvey(survey.id),
    onSuccess: () => {
      setClosing(false);
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      toast.success('Survey closed');
    },
    onError: (err) => {
      setClosing(false);
      toast.error('Couldn’t close the survey', apiErrorMessage(err));
    },
  });
  const duplicate = useMutation({
    mutationFn: () => duplicateSurvey(survey.id),
    onSuccess: (copy) => {
      void queryClient.invalidateQueries({ queryKey: ['surveys'] });
      navigate(`/surveys/${copy.id}`);
    },
    onError: (err) => toast.error('Couldn’t duplicate the survey', apiErrorMessage(err)),
  });

  const unanswered = survey.counts.pending + survey.counts.skipped;
  return (
    <>
      <DetailHeader
        title={survey.title}
        subtitle={survey.description ?? undefined}
        backTo="/surveys"
        backLabel="Surveys"
        actions={
          <>
            <Badge tone={SURVEY_STATUS_TONE[survey.status]}>{SURVEY_STATUS_LABEL[survey.status]}</Badge>
            {canManage && (
              <Button variant="ghost" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
                Duplicate
              </Button>
            )}
            {canManage && open && (
              <Button variant="ghost" onClick={() => navigate(`/surveys/${survey.id}/add-recipients`)}>
                Add recipients
              </Button>
            )}
            {canManage && open && (
              <Button variant="danger" onClick={() => setClosing(true)}>
                Close survey
              </Button>
            )}
          </>
        }
      />
      <div className="stat-grid stat-grid--quad">
        <StatCard label="Sent to" value={survey.counts.recipients} />
        <StatCard label="Answered" value={survey.counts.answered} hint={responseRate(survey.counts)} />
        <StatCard label="Skipped" value={survey.counts.skipped} />
        <StatCard label="No response" value={survey.counts.pending} />
      </div>
      <Tabs
        label="Survey sections"
        tabs={[
          { value: 'results', label: 'Results' },
          { value: 'recipients', label: 'Recipients' },
        ]}
        value={tab}
        onChange={setTab}
      >
        {tab === 'results' ? <SurveyResults survey={survey} /> : <SurveyRecipients survey={survey} />}
      </Tabs>
      {closing && (
        <ConfirmDialog
          title="Close this survey?"
          message={`${unanswered} ${unanswered === 1 ? 'mother who hasn’t' : 'mothers who haven’t'} answered will no longer see it. Answers so far are kept. This can’t be undone.`}
          confirmLabel="Close survey"
          danger
          busy={close.isPending}
          onConfirm={() => close.mutate()}
          onCancel={() => setClosing(false)}
        />
      )}
    </>
  );
}
