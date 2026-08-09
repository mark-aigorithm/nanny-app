import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type {
  AdminMarketplaceListing,
  CreateOfficialListingInput,
} from '@nanny-app/shared';

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
import {
  approveListing,
  deleteOfficialListing,
  rejectListing,
  updateOfficialListing,
} from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { formatDateTime, formatEgp } from '@admin/lib/format';

import { OfficialListingEditModal } from './official-listing-form';

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

type ListingTableProps = {
  listings: AdminMarketplaceListing[];
};

export function ListingTable({ listings }: ListingTableProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState<AdminMarketplaceListing | null>(null);
  const [editing, setEditing] = useState<AdminMarketplaceListing | null>(null);
  const [deleting, setDeleting] = useState<AdminMarketplaceListing | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });

  const approveMutation = useMutation({
    mutationFn: approveListing,
    onSuccess: (listing) => {
      invalidate();
      toast.success('Listing approved', `“${listing.title}” is now live in the marketplace.`);
    },
    onError: (err) => toast.error('Couldn’t approve listing', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectListing(id, reason),
    onSuccess: (listing) => {
      invalidate();
      setRejecting(null);
      toast.success('Listing rejected', `The seller can edit “${listing.title}” and resubmit.`);
    },
    onError: (err) => toast.error('Couldn’t reject listing', apiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateOfficialListingInput }) =>
      updateOfficialListing(id, input),
    onSuccess: (listing) => {
      invalidate();
      setEditing(null);
      toast.success('Listing updated', listing.title);
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

  const columns: Column<AdminMarketplaceListing>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (listing) => (
        <div className="listing-cell">
          {listing.imageUrls[0] ? (
            <img className="listing-cell-image" src={listing.imageUrls[0]} alt="" />
          ) : (
            <span className="listing-cell-image listing-cell-image--empty" aria-hidden="true" />
          )}
          <div className="listing-cell-text">
            <span className="listing-cell-title">{listing.title}</span>
            {listing.body && <span className="listing-cell-body">{listing.body}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (listing) =>
        listing.price !== null ? formatEgp(listing.price) : <span className="table-empty">—</span>,
    },
    {
      key: 'seller',
      header: 'Seller',
      render: (listing) =>
        listing.isOfficial ? <Badge>Official</Badge> : listing.seller.name,
    },
    {
      key: 'status',
      header: 'Status',
      render: (listing) => (
        <div className="listing-status">
          <Badge tone={STATUS_TONE[listing.moderationStatus]}>
            {STATUS_LABEL[listing.moderationStatus]}
          </Badge>
          {listing.rejectionReason && (
            <span className="listing-reason">{listing.rejectionReason}</span>
          )}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (listing) => formatDateTime(listing.createdAt),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (listing) => (
        <ActionMenu label={`Actions for ${listing.title}`}>
          {!listing.isOfficial && (
            <MenuItem
              icon={<Check size={ICON_SIZE.menu} />}
              disabled={listing.moderationStatus === 'approved' || approveMutation.isPending}
              onSelect={() => approveMutation.mutate(listing.id)}
            >
              Approve
            </MenuItem>
          )}
          {!listing.isOfficial && (
            <MenuItem
              icon={<Ban size={ICON_SIZE.menu} />}
              disabled={listing.moderationStatus === 'rejected'}
              onSelect={() => setRejecting(listing)}
            >
              {listing.moderationStatus === 'approved' ? 'Take down' : 'Reject'}
            </MenuItem>
          )}
          {listing.isOfficial && (
            <>
              <MenuItem
                icon={<Pencil size={ICON_SIZE.menu} />}
                onSelect={() => setEditing(listing)}
              >
                Edit
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={ICON_SIZE.menu} />}
                onSelect={() => setDeleting(listing)}
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
        rows={listings}
        rowKey={(listing) => listing.id}
        empty="No listings in this queue."
      />

      {rejecting && (
        <PromptDialog
          title={rejecting.moderationStatus === 'approved' ? 'Take down listing' : 'Reject listing'}
          message={`The seller sees this reason on “${rejecting.title}” and can edit it and resubmit.`}
          label="Reason"
          placeholder="e.g. Photos are too blurry to see the item"
          confirmLabel={
            rejecting.moderationStatus === 'approved' ? 'Take down' : 'Reject listing'
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
          message={`Delete “${deleting.title}”? It disappears from the marketplace immediately.`}
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
