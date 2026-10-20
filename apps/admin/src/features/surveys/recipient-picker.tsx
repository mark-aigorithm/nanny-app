import type { AdminSurvey } from '@nanny-app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  ConfirmDialog,
  DetailHeader,
  ErrorState,
  ICON_SIZE,
  ListChecks,
  Send,
  Skeleton,
  Users,
  useToast,
} from '@admin/components/ui';
import { MotherPickerTable } from '@admin/features/groups/mother-picker-table';
import {
  addSurveyRecipients,
  fetchMotherPicker,
  fetchSurvey,
  fetchUserGroups,
  publishSurvey,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';

type Audience = 'EVERYONE' | 'CHOOSE';

type RecipientPickerProps = {
  survey: AdminSurvey;
  mode: 'publish' | 'add';
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Who gets a survey, as a page: first every mother or a chosen few (nothing is
 * preselected, so no one sends to everyone by accident), then for "Choose
 * mothers" the groups and ticked mothers, unioned. Publishing (or adding)
 * confirms with the reach, then returns to the survey.
 */
export function RecipientPicker({ survey, mode }: RecipientPickerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<Audience | null>(null);
  const [groupIds, setGroupIds] = useState<ReadonlySet<number>>(new Set());
  const [userIds, setUserIds] = useState<ReadonlySet<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // Set once the send went through, so leaving afterwards isn't asked about.
  const leavingOnPurpose = useRef(false);
  const backTo = `/surveys/${survey.id}`;
  const everyoneChosen = audience === 'EVERYONE';

  const groups = useQuery({
    queryKey: ['groups'],
    queryFn: fetchUserGroups,
    enabled: audience === 'CHOOSE',
  });
  // "Every mother" reaches every active mother: the picker's unfiltered total.
  const everyone = useQuery({
    queryKey: ['mother-picker', 'total'],
    queryFn: () => fetchMotherPicker({ page: 1, limit: 1, sortBy: 'createdAt', sortDir: 'desc' }),
  });
  const total = everyone.data?.meta.total;

  const picked = groupIds.size > 0 || userIds.size > 0;
  // A picked selection is real work: ask before leaving it behind.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      audience === 'CHOOSE' &&
      picked &&
      !leavingOnPurpose.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  const leave = () => {
    leavingOnPurpose.current = true;
    void queryClient.invalidateQueries({ queryKey: ['surveys'] });
    navigate(backTo, { replace: true });
  };

  const send = useMutation({
    mutationFn: () => {
      const target = {
        allMothers: everyoneChosen,
        groupIds: everyoneChosen ? [] : [...groupIds],
        userIds: everyoneChosen ? [] : [...userIds],
      };
      return mode === 'publish'
        ? publishSurvey(survey.id, target)
        : addSurveyRecipients(survey.id, target);
    },
    onSuccess: ({ count }) => {
      setConfirming(false);
      toast.success(
        mode === 'publish'
          ? `Sent to ${plural(count, 'mother')}`
          : `Added ${plural(count, 'mother')}`,
      );
      leave();
    },
    onError: async (err) => {
      setConfirming(false);
      // Publish sends its pushes inside the request, so a function timeout can
      // cut it off after the survey went out. Ask the server what happened
      // before telling the admin it failed.
      if (mode === 'publish' && (await isPublishedNow())) {
        toast.toast({
          tone: 'info',
          title: 'Published; some notifications may not have been delivered',
        });
        leave();
        return;
      }
      toast.error("Couldn't send the survey", apiErrorMessage(err));
    },
  });

  const isPublishedNow = async () => {
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: ['surveys', survey.id],
        queryFn: () => fetchSurvey(survey.id),
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

  const ready = everyoneChosen || (audience === 'CHOOSE' && picked);
  // The most it can reach: groups can overlap each other and the ticked
  // mothers, and the server sends each mother once, so this is an upper bound.
  const groupMembers = (groups.data ?? [])
    .filter((g) => groupIds.has(g.id))
    .reduce((n, g) => n + g.memberCount, 0);
  const upTo = groupMembers + userIds.size;
  const exact = groupIds.size === 0;
  const everyoneLabel =
    total === undefined ? 'every active mother' : `all ${plural(total, 'mother')}`;
  const reach = everyoneChosen
    ? everyoneLabel
    : exact
      ? plural(upTo, 'mother')
      : `up to ${plural(upTo, 'mother')}`;

  const summary =
    audience === null
      ? 'Choose who gets this survey.'
      : everyoneChosen
        ? total === undefined
          ? 'Every active mother will get this survey.'
          : `All ${plural(total, 'active mother')} will get this survey.`
        : !picked
          ? 'Pick groups, mothers, or both.'
          : exact
            ? `${plural(upTo, 'mother')} will get this survey.`
            : `${plural(groupIds.size, 'group')} and ${plural(userIds.size, 'mother')}: up to ${plural(upTo, 'mother')}; anyone in both gets it once.`;

  // Publishing can't be undone, and "Every mother" pushes to everyone: say how many first.
  const needsConfirm = mode === 'publish' || everyoneChosen;
  const submit = () => (needsConfirm ? setConfirming(true) : send.mutate());
  const sendLabel = send.isPending
    ? mode === 'publish'
      ? 'Publishing…'
      : 'Adding…'
    : mode === 'publish'
      ? 'Publish and notify'
      : exact && !everyoneChosen && upTo > 0
        ? `Add ${plural(upTo, 'mother')}`
        : 'Add recipients';

  return (
    <section>
      <DetailHeader
        title={mode === 'publish' ? 'Publish survey' : 'Add recipients'}
        subtitle={
          mode === 'publish'
            ? `“${survey.title}”. Publishing locks the questions, and each mother gets a push notification.`
            : `“${survey.title}”. Mothers who already have it are skipped; the rest get a push notification.`
        }
        backTo={backTo}
        backLabel={survey.title}
      />

      <fieldset className="audience-choice">
        <legend>Who gets it</legend>
        <label className="audience-option">
          <input
            type="radio"
            name="audience"
            checked={everyoneChosen}
            onChange={() => setAudience('EVERYONE')}
          />
          <Users size={ICON_SIZE.stat} className="audience-option-icon" aria-hidden />
          <span className="audience-option-body">
            <span className="audience-option-title">Every mother</span>
            <span className="audience-option-hint">
              {total === undefined
                ? 'Every active mother, right now.'
                : `All ${plural(total, 'active mother')}, right now.`}
            </span>
          </span>
        </label>
        <label className="audience-option">
          <input
            type="radio"
            name="audience"
            checked={audience === 'CHOOSE'}
            onChange={() => setAudience('CHOOSE')}
          />
          <ListChecks size={ICON_SIZE.stat} className="audience-option-icon" aria-hidden />
          <span className="audience-option-body">
            <span className="audience-option-title">Choose mothers</span>
            <span className="audience-option-hint">Pick groups, specific mothers, or both.</span>
          </span>
        </label>
      </fieldset>

      {audience === 'CHOOSE' && (
        <div className="audience-pick">
          <Card title="Groups">
            <fieldset className="recipient-groups">
              <legend className="sr-only">Groups</legend>
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
          </Card>
          <Card title="Mothers">
            <MotherPickerTable selected={userIds} onSelectedChange={setUserIds} />
          </Card>
        </div>
      )}

      <div className="page-action-bar">
        <p className="page-action-summary" aria-live="polite">
          {summary}
        </p>
        <div className="page-action-buttons">
          <Button variant="ghost" onClick={() => navigate(backTo)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || send.isPending}>
            <Send size={ICON_SIZE.inline} aria-hidden />
            {sendLabel}
          </Button>
        </div>
      </div>

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
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Discard your selection?"
          message="The groups and mothers you picked will be cleared."
          confirmLabel="Discard"
          cancelLabel="Keep picking"
          danger
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      )}
    </section>
  );
}
