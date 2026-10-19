import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Modal, Switch, useToast } from '@admin/components/ui';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import { addSurveyRecipients, fetchSurvey, fetchUserGroups, publishSurvey } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type RecipientPickerModalProps = {
  surveyId: number;
  mode: 'publish' | 'add';
  onDone: (count: number) => void;
  onClose: () => void;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Pick who gets a survey: everyone, groups and ticked mothers (unioned), then publish or add. */
export function RecipientPickerModal({ surveyId, mode, onDone, onClose }: RecipientPickerModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [allMothers, setAllMothers] = useState(false);
  const [groupIds, setGroupIds] = useState<ReadonlySet<number>>(new Set());
  const [userIds, setUserIds] = useState<ReadonlySet<number>>(new Set());
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchUserGroups });

  const send = useMutation({
    mutationFn: () => {
      const target = {
        allMothers,
        groupIds: allMothers ? [] : [...groupIds],
        userIds: allMothers ? [] : [...userIds],
      };
      return mode === 'publish' ? publishSurvey(surveyId, target) : addSurveyRecipients(surveyId, target);
    },
    onSuccess: ({ count }) => onDone(count),
    onError: async (err) => {
      // Publish sends its pushes inside the request, so a function timeout can
      // cut it off after the survey went out. Ask the server what happened
      // before telling the admin it failed.
      if (mode === 'publish' && (await isPublishedNow())) {
        void queryClient.invalidateQueries({ queryKey: ['surveys'] });
        toast.toast({ tone: 'info', title: 'Published; some notifications may not have been delivered' });
        onClose();
        return;
      }
      toast.error("Couldn't send the survey", apiErrorMessage(err));
    },
  });

  const isPublishedNow = async () => {
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: ['surveys', surveyId],
        queryFn: () => fetchSurvey(surveyId),
        staleTime: 0,
      });
      return fresh.status === 'PUBLISHED';
    } catch {
      return false;
    }
  };

  const toggleGroup = (id: number) => {
    const next = new Set(groupIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setGroupIds(next);
  };

  const empty = !allMothers && groupIds.size === 0 && userIds.size === 0;
  const summary = allMothers
    ? 'Every active mother will get this survey.'
    : empty
      ? 'Choose groups or mothers.'
      : `${plural(groupIds.size, 'group')} and ${plural(userIds.size, 'mother')}; anyone in both is sent it once.`;

  return (
    <Modal
      title={mode === 'publish' ? 'Publish survey' : 'Add recipients'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="recipient-summary">{summary}</span>
          <Button onClick={() => send.mutate()} disabled={empty || send.isPending}>
            {mode === 'publish' ? 'Publish and notify' : 'Send to them'}
          </Button>
        </>
      }
    >
      <p className="recipient-hint">
        {mode === 'publish'
          ? 'Publishing locks the questions. Each mother gets a push notification.'
          : 'Mothers who already have this survey are skipped.'}
      </p>
      <Switch checked={allMothers} onChange={setAllMothers} label="All mothers" />
      {!allMothers && (
        <>
          <fieldset className="recipient-groups">
            <legend>Groups</legend>
            {(groups.data ?? []).map((g) => (
              <label key={g.id} className="recipient-group">
                <input
                  type="checkbox"
                  aria-label={`${g.name} (${g.memberCount})`}
                  checked={groupIds.has(g.id)}
                  onChange={() => toggleGroup(g.id)}
                />
                {g.name} ({g.memberCount})
              </label>
            ))}
            {groups.data?.length === 0 && <p className="recipient-hint">No groups yet.</p>}
          </fieldset>
          <MotherPickerTable selected={userIds} onSelectedChange={setUserIds} />
        </>
      )}
    </Modal>
  );
}
