import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminCommunityPost, CreateOfficialListingInput } from '@nanny-app/shared';

import {
  ActionMenu,
  Badge,
  Ban,
  Check,
  type Column,
  ConfirmDialog,
  ICON_SIZE,
  MenuItem,
  MenuSeparator,
  Pencil,
  PromptDialog,
  Table,
  Trash2,
  useToast,
} from '@admin/components/ui';
import { OfficialListingEditModal } from '@admin/features/marketplace/official-listing-form';
import {
  approvePost,
  deleteOfficialListing,
  rejectPost,
  updateOfficialListing,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime, formatEgp } from '@admin/lib/format';
import { useCanManage } from '@admin/lib/permissions';

const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const;

const STATUS_LABEL = {
  pending: 'Pending review',
  approved: 'Live',
  rejected: 'Rejected',
} as const;

const TYPE_LABEL = {
  qa: 'Q&A',
  marketplace: 'Marketplace',
  event: 'Event',
} as const;

/** What a row is called in dialogs — a listing is still a listing. */
function nounFor(post: AdminCommunityPost): string {
  return post.type === 'marketplace' ? 'listing' : post.type === 'event' ? 'event' : 'post';
}

/** A Q&A post may have no headline; its question is what identifies it. */
export function displayTitle(post: AdminCommunityPost): string {
  return post.title ?? post.body ?? `Post #${post.id}`;
}

type PostTableProps = {
  posts: AdminCommunityPost[];
};

export function PostTable({ posts }: PostTableProps) {
  const canManage = useCanManage('marketplace');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<AdminCommunityPost | null>(null);
  const [editing, setEditing] = useState<AdminCommunityPost | null>(null);
  const [deleting, setDeleting] = useState<AdminCommunityPost | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['community-posts'] });

  const approveMutation = useMutation({
    mutationFn: approvePost,
    onSuccess: (post) => {
      invalidate();
      toast.success('Post approved', `“${displayTitle(post)}” is now live in the community.`);
    },
    onError: (err) => toast.error('Couldn’t approve post', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectPost(id, reason),
    onSuccess: (post) => {
      invalidate();
      setRejecting(null);
      toast.success('Post rejected', `The author can edit “${displayTitle(post)}” and resubmit.`);
    },
    onError: (err) => toast.error('Couldn’t reject post', apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateOfficialListingInput }) =>
      updateOfficialListing(id, input),
    onSuccess: (post) => {
      invalidate();
      setEditing(null);
      toast.success('Listing updated', displayTitle(post));
    },
    onError: (err) => toast.error('Couldn’t update listing', apiErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOfficialListing,
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success('Official listing deleted');
    },
    onError: (err) => toast.error('Couldn’t delete listing', apiErrorMessage(err)),
  });

  const columns: Column<AdminCommunityPost>[] = [
    {
      key: 'item',
      header: 'Post',
      render: (post) => (
        <div className="listing-cell">
          {post.imageUrls[0] ? (
            <img className="listing-cell-image" src={post.imageUrls[0]} alt="" />
          ) : (
            <span className="listing-cell-image listing-cell-image--empty" aria-hidden="true" />
          )}
          <div className="listing-cell-text">
            <span className="listing-cell-title">{displayTitle(post)}</span>
            {post.title && post.body && <span className="listing-cell-body">{post.body}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (post) => <Badge>{TYPE_LABEL[post.type]}</Badge>,
    },
    {
      key: 'details',
      header: 'Details',
      render: (post) => {
        if (post.type === 'marketplace') {
          return post.price !== null ? (
            formatEgp(post.price)
          ) : (
            <span className="table-empty">—</span>
          );
        }
        if (post.type === 'event') {
          return (
            <div className="listing-cell-text">
              {post.eventStartsAt && <span>{formatDateTime(post.eventStartsAt)}</span>}
              {post.location && <span className="listing-cell-meta">{post.location}</span>}
            </div>
          );
        }
        return <span className="table-empty">—</span>;
      },
    },
    {
      key: 'author',
      header: 'Author',
      render: (post) => (post.isOfficial ? <Badge>Official</Badge> : post.author.name),
    },
    {
      key: 'status',
      header: 'Status',
      render: (post) => (
        <div className="listing-status">
          <Badge tone={STATUS_TONE[post.moderationStatus]}>
            {STATUS_LABEL[post.moderationStatus]}
          </Badge>
          {post.rejectionReason && <span className="listing-reason">{post.rejectionReason}</span>}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (post) => formatDateTime(post.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (post) => (
        <ActionMenu label={`Actions for ${displayTitle(post)}`} disabled={!canManage}>
          {!post.isOfficial && (
            <MenuItem
              icon={<Check size={ICON_SIZE.menu} />}
              disabled={post.moderationStatus === 'approved' || approveMutation.isPending}
              onSelect={() => approveMutation.mutate(post.id)}
            >
              Approve
            </MenuItem>
          )}
          {!post.isOfficial && (
            <MenuItem
              icon={<Ban size={ICON_SIZE.menu} />}
              disabled={post.moderationStatus === 'rejected'}
              onSelect={() => setRejecting(post)}
            >
              {post.moderationStatus === 'approved' ? 'Take down' : 'Reject'}
            </MenuItem>
          )}
          {post.isOfficial && (
            <>
              <MenuItem icon={<Pencil size={ICON_SIZE.menu} />} onSelect={() => setEditing(post)}>
                Edit
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={ICON_SIZE.menu} />}
                onSelect={() => setDeleting(post)}
              >
                Delete
              </MenuItem>
            </>
          )}
        </ActionMenu>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        rows={posts}
        rowKey={(post) => post.id}
        empty="No posts in this queue."
      />

      {rejecting && (
        <PromptDialog
          title={
            rejecting.moderationStatus === 'approved'
              ? `Take down ${nounFor(rejecting)}`
              : `Reject ${nounFor(rejecting)}`
          }
          message={`The author sees this reason on “${displayTitle(rejecting)}” and can edit it and resubmit.`}
          label="Reason"
          placeholder="e.g. Photos are too blurry to see the item"
          confirmLabel={
            rejecting.moderationStatus === 'approved' ? 'Take down' : `Reject ${nounFor(rejecting)}`
          }
          multiline
          required
          danger
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate({ id: rejecting.id, reason })}
          onCancel={() => setRejecting(null)}
        />
      )}

      {editing && (
        <OfficialListingEditModal
          listing={editing}
          busy={updateMutation.isPending}
          onCancel={() => setEditing(null)}
          onSave={(input) => updateMutation.mutate({ id: editing.id, input })}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete official listing"
          message={`Delete “${displayTitle(deleting)}”? It disappears from the marketplace immediately.`}
          confirmLabel="Delete listing"
          danger
          busy={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
