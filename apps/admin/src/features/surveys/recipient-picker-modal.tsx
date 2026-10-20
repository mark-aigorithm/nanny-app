import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, ConfirmDialog, ErrorState, Modal, Skeleton, Switch, useToast } from '@admin/components/ui';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import {
  addSurveyRecipients,
  fetchMotherPicker,
  fetchSurvey,
  fetchUserGroups,
  publishSurvey,
} from '@admin/lib/api';
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
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const groups = useQuery({ queryKey: ['groups'], queryFn: fetchUserGroups });
  // "All mothers" reaches every active mother — the picker's unfiltered total.
  const everyone = useQuery({
    queryKey: ['mother-picker', 'total'],
    queryFn: () => fetchMotherPicker({ page: 1, limit: 1, sortBy: 'createdAt', sortDir: 'desc' }),
    enabled: allMothers,
  });

  const send = useMutation({
    mutationFn: () => {
      const target = {
        allMothers,
        groupIds: allMothers ? [] : [...groupIds],
        userIds: allMothers ? [] : [...userIds],
      };
      return mode === 'publish' ? publishSurvey(surveyId, target) : addSurveyRecipients(surveyId, target);
    },
    onSuccess: ({ count }) => {
      setConfirming(false);
      onDone(count);
    },
    onError: async (err) => {
      setConfirming(false);
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
  // The most it can reach: groups can overlap each other and the ticked
  // mothers, and the server sends each mother once, so this is an upper bound.
  const groupMembers = (groups.data ?? []).filter((g) => groupIds.has(g.id)).reduce((n, g) => n + g.memberCount, 0);
  const upTo = groupMembers + userIds.size;
  const exact = groupIds.size === 0;
  const total = everyone.data?.meta.total;
  const reach = allMothers
    ? total === undefined
      ? 'every active mother'
      : `all ${plural(total, 'mother')}`
    : exact
      ? plural(upTo, 'mother')
      : `up to ${plural(upTo, 'mother')}`;

  const summary = allMothers
    ? total === undefined
      ? 'Every active mother will get this survey.'
      : `All ${total} active ${total === 1 ? 'mother' : 'mothers'} will get this survey.`
    : empty
      ? 'Choose groups or mothers.'
      : exact
        ? `${plural(upTo, 'mother')} will get this survey.`
        : `${plural(groupIds.size, 'group')} and ${plural(userIds.size, 'mother')}: up to ${plural(upTo, 'mother')}; anyone in both is sent it once.`;

  // Publishing can't be undone, and "All mothers" pushes to everyone: say how many first.
  const needsConfirm = mode === 'publish' || allMothers;
  const submit = () => (needsConfirm ? setConfirming(true) : send.mutate());
  // A picked selection is real work; don't let Escape or Close drop it unasked.
  const requestClose = () => (empty ? onClose() : setDiscarding(true));
  const sendLabel =
    mode === 'publish'
      ? 'Publish and notify'
      : exact && !allMothers && upTo > 0
        ? `Add ${plural(upTo, 'mother')}`
        : 'Add recipients';

  return (
    <Modal
      title={mode === 'publish' ? 'Publish survey' : 'Add recipients'}
      size="lg"
      onClose={requestClose}
      dismissible={empty}
      footer={
        <>
          <span className="recipient-summary" aria-live="polite">
            {summary}
          </span>
          <Button onClick={submit} disabled={empty || send.isPending}>
            {sendLabel}
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
            {groups.isPending && (
              <>
                <span className="sr-only">Loading groups…</span>
                <Skeleton width="10rem" height="1.25rem" />
                <Skeleton width="8rem" height="1.25rem" />
              </>
            )}
            {groups.isError && (
              <div className="recipient-groups-error">
                <ErrorState
                  title="We couldn’t load the groups"
                  message={apiErrorMessage(groups.error)}
                  onRetry={() => void groups.refetch()}
                  retrying={groups.isFetching}
                />
              </div>
            )}
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
      {confirming && (
        <ConfirmDialog
          title={mode === 'publish' ? `Publish to ${reach}?` : `Send to ${reach}?`}
          message={
            mode === 'publish'
              ? 'Publishing locks the questions and sends each of them a push notification. This can’t be undone.'
              : 'Each of them who doesn’t have this survey yet gets a push notification.'
          }
          confirmLabel={mode === 'publish' ? 'Publish' : 'Send'}
          busy={send.isPending}
          onConfirm={() => send.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
      {discarding && (
        <ConfirmDialog
          title="Discard your selection?"
          message="The groups and mothers you picked will be cleared."
          confirmLabel="Discard"
          cancelLabel="Keep picking"
          danger
          onConfirm={onClose}
          onCancel={() => setDiscarding(false)}
        />
      )}
    </Modal>
  );
}
