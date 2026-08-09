import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  idTypeRequiresBack,
  type AdminIdReview,
  type IdDocumentType,
} from '@nanny-app/shared';

import {
  Badge,
  Ban,
  Button,
  Check,
  ConfirmDialog,
  ICON_SIZE,
  PromptDialog,
  useToast,
} from '@admin/components/ui';
import { IdDocumentModal } from '@admin/features/nannies/id-document-modal';
import { approveMother, approveNanny, rejectMother, rejectNanny } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { useCanManage } from '@admin/lib/permissions';
import { idStatusLabel, idStatusTone } from '@admin/lib/id-status';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

const ROLE_LABEL: Record<AdminIdReview['role'], string> = {
  MOTHER: 'Parent',
  NANNY: 'Nanny',
};

const ID_TYPE_LABEL: Record<IdDocumentType, string> = {
  PASSPORT: 'Passport',
  NATIONAL_ID: 'National ID',
};

/**
 * One reviewable ID in the gallery: the person, their ID photo(s), and the
 * current KYC status — with Approve/Reject inline when the ID is awaiting review.
 * Approve/reject dispatch to the matching per-role endpoint by `review.role`.
 */
export function IdReviewCard({ review }: { review: AdminIdReview }) {
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [viewing, setViewing] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const id = String(review.id);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-id-reviews'] });
    // Keep the per-role tables in sync too, so a decision here shows up there.
    void queryClient.invalidateQueries({
      queryKey: [review.role === 'MOTHER' ? 'admin-mothers' : 'admin-nannies'],
    });
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (review.role === 'MOTHER') await approveMother(id);
      else await approveNanny(id);
    },
    onSuccess: () => {
      invalidate();
      setConfirmingApprove(false);
      toast.success('ID approved', review.name);
    },
    onError: (err) => toast.error('Couldn’t approve ID', apiErrorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason?: string) => {
      if (review.role === 'MOTHER') await rejectMother(id, reason);
      else await rejectNanny(id, reason);
    },
    onSuccess: () => {
      invalidate();
      setRejecting(false);
      toast.success('ID rejected', review.name);
    },
    onError: (err) => toast.error('Couldn’t reject ID', apiErrorMessage(err)),
  });

  const canManage = useCanManage('users');
  const mutating = approveMutation.isPending || rejectMutation.isPending;
  // A view-only operator still sees the document and its state, but the
  // approve/reject pair is what actually changes an account — so it's gated.
  const canReview = canManage && review.idVerificationStatus === 'PENDING_REVIEW';
  const hasImages = Boolean(review.idDocumentFrontUrl || review.idDocumentBackUrl);
  const showBack = review.idDocumentType != null && idTypeRequiresBack(review.idDocumentType);
  const idTypeLabel = review.idDocumentType ? ID_TYPE_LABEL[review.idDocumentType] : 'No ID on file';

  return (
    <div className="id-review-card">
      <div className="id-review-card-head">
        {review.avatarUrl ? (
          <img className="id-review-avatar" src={review.avatarUrl} alt="" />
        ) : (
          <span className="id-review-avatar id-review-avatar--fallback" aria-hidden>
            {initials(review.name) || '?'}
          </span>
        )}
        <div className="id-review-identity">
          <span className="id-review-name">{review.name}</span>
          <span className="id-review-sub">
            {ROLE_LABEL[review.role]} · {idTypeLabel}
          </span>
        </div>
        {review.idVerificationStatus && (
          <Badge tone={idStatusTone(review.idVerificationStatus)}>
            {idStatusLabel(review.idVerificationStatus)}
          </Badge>
        )}
      </div>

      {hasImages ? (
        <button
          type="button"
          className="id-review-thumbs"
          onClick={() => setViewing(true)}
          title="Click to enlarge"
        >
          <span className="id-review-thumb">
            {review.idDocumentFrontUrl ? (
              <img src={review.idDocumentFrontUrl} alt={`Front of ${review.name}'s ID`} />
            ) : (
              <span className="id-review-thumb-empty">No front image</span>
            )}
            <span className="id-review-thumb-tag">Front</span>
          </span>
          {showBack && (
            <span className="id-review-thumb">
              {review.idDocumentBackUrl ? (
                <img src={review.idDocumentBackUrl} alt={`Back of ${review.name}'s ID`} />
              ) : (
                <span className="id-review-thumb-empty">No back image</span>
              )}
              <span className="id-review-thumb-tag">Back</span>
            </span>
          )}
        </button>
      ) : (
        <div className="id-review-noimage">No image on file</div>
      )}

      {review.rejectionReason ? (
        <p className="id-review-note">Reason: {review.rejectionReason}</p>
      ) : (
        review.reviewedAt && (
          <p className="id-review-note id-review-note--muted">
            Reviewed {formatDate(review.reviewedAt)}
          </p>
        )
      )}

      {canReview && (
        <div className="id-review-actions">
          <Button size="sm" disabled={mutating} onClick={() => setConfirmingApprove(true)}>
            <Check size={ICON_SIZE.inline} aria-hidden />
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={mutating}
            onClick={() => setRejecting(true)}
          >
            <Ban size={ICON_SIZE.inline} aria-hidden />
            Reject
          </Button>
        </div>
      )}

      {viewing && <IdDocumentModal subject={review} onClose={() => setViewing(false)} />}

      {confirmingApprove && (
        <ConfirmDialog
          title="Approve this ID?"
          message={`Mark ${review.name}'s ID as verified?`}
          confirmLabel="Approve ID"
          busy={approveMutation.isPending}
          onConfirm={() => approveMutation.mutate()}
          onCancel={() => setConfirmingApprove(false)}
        />
      )}

      {rejecting && (
        <PromptDialog
          title="Reject ID"
          message={`Reject ${review.name}'s ID? The photos will be removed and they'll be asked to upload a new one.`}
          label="Reason (optional — shown to the user)"
          placeholder="e.g. Photo was blurry"
          confirmLabel="Reject ID"
          danger
          multiline
          busy={rejectMutation.isPending}
          onSubmit={(reason) => rejectMutation.mutate(reason || undefined)}
          onCancel={() => setRejecting(false)}
        />
      )}
    </div>
  );
}
