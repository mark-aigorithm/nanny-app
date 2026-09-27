import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';

import {
  COMMUNITY_TAGS,
  CreateOfficialListingSchema,
  type AdminCommunityPost,
  type CommunityTag,
} from '@nanny-app/shared';

import { Field, FormModal, useToast } from '@admin/components/ui';
import { createOfficialListing, updateOfficialListing } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { uploadImageToFirebase } from '@admin/lib/storage';

const MAX_IMAGES = 4;

type DraftState = {
  title: string;
  body: string;
  price: string;
  imageUrls: string[];
  tags: CommunityTag[];
  contactPhone: string;
};

function emptyDraft(): DraftState {
  return { title: '', body: '', price: '', imageUrls: [], tags: [], contactPhone: '' };
}

function draftFromListing(listing: AdminCommunityPost): DraftState {
  return {
    title: listing.title ?? '',
    body: listing.body ?? '',
    price: listing.price !== null ? String(listing.price) : '',
    imageUrls: listing.imageUrls,
    tags: listing.tags.filter((tag): tag is CommunityTag =>
      (COMMUNITY_TAGS as readonly string[]).includes(tag),
    ),
    contactPhone: listing.contactPhone ?? '',
  };
}

type OfficialListingFormModalProps = {
  /** The official listing to edit; omit to publish a new one. */
  listing?: AdminCommunityPost;
  onClose: () => void;
};

/**
 * Publish an official ("Sold by NannyNow") listing, or edit one — the Community
 * page's one dialog for both. A new listing goes live immediately (an admin
 * authored it, so it never enters the review queue) and is pinned above seller
 * listings in the app's marketplace feed; an edit never re-enters review either.
 */
export function OfficialListingFormModal({ listing, onClose }: OfficialListingFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<DraftState>(() =>
    listing ? draftFromListing(listing) : emptyDraft(),
  );
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AdminCommunityPost>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast.success(listing ? 'Listing updated' : 'Official listing published', saved.title ?? '');
      onClose();
    },
    onError: (err) => setFormError(apiErrorMessage(err)),
  });

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const url = await uploadImageToFirebase(file, 'marketplace');
      setDraft((current) => ({
        ...current,
        imageUrls: [...current.imageUrls, url].slice(0, MAX_IMAGES),
      }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  /**
   * Validated against the shared schema — the same one the API validates with,
   * so the console can't submit something the backend would reject.
   */
  function submit() {
    setFormError(null);
    const parsed = CreateOfficialListingSchema.safeParse({
      title: draft.title.trim(),
      body: draft.body.trim() ? draft.body.trim() : undefined,
      price: Number(draft.price),
      imageUrls: draft.imageUrls,
      tags: draft.tags,
      contactPhone: draft.contactPhone,
    });
    if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
    const input = parsed.data;
    saveMutation.mutate(() =>
      listing ? updateOfficialListing(listing.id, input) : createOfficialListing(input),
    );
  }

  const toggleTag = (tag: CommunityTag) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((t) => t !== tag)
        : current.tags.slice(0, 4).concat(tag),
    }));

  const idPrefix = listing ? `listing-${listing.id}` : 'new-listing';

  return (
    <FormModal
      title={listing ? 'Edit official listing' : 'Add official listing'}
      submitLabel={listing ? 'Save changes' : 'Publish listing'}
      busy={saveMutation.isPending}
      submitDisabled={uploading}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        <Field label="Product name">
          <input
            value={draft.title}
            autoFocus
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Convertible car seat"
            required
          />
        </Field>
        <Field label="Price (EGP)">
          <input
            type="number"
            min="1"
            step="0.01"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            placeholder="3500"
            required
          />
        </Field>
        <Field
          label="Contact number"
          hint="Buyers call or WhatsApp this instead of messaging a seller."
        >
          <input
            value={draft.contactPhone}
            onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
            placeholder="+20 100 123 4567"
            required
          />
        </Field>
        <Field label="Description" hint="Optional — shown under the photos.">
          <input
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder="Brand new, sealed box"
          />
        </Field>
        <Field
          label="Photos"
          hint={
            uploading
              ? 'Uploading…'
              : `${draft.imageUrls.length}/${MAX_IMAGES} uploaded. At least one is required.`
          }
        >
          <input
            type="file"
            accept="image/*"
            disabled={uploading || draft.imageUrls.length >= MAX_IMAGES}
            onChange={(e) => void handleImage(e)}
          />
        </Field>
      </div>

      {draft.imageUrls.length > 0 && (
        <div className="field">
          <span className="field-label">Preview</span>
          <div className="listing-thumbs">
            {draft.imageUrls.map((url) => (
              <div className="listing-thumb" key={url}>
                <img src={url} alt="" />
                <button
                  type="button"
                  className="listing-thumb-remove"
                  aria-label="Remove photo"
                  onClick={() =>
                    setDraft({ ...draft, imageUrls: draft.imageUrls.filter((u) => u !== url) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label">Tags</span>
        <div className="tag-toggle-row">
          {COMMUNITY_TAGS.map((tag) => (
            <button
              type="button"
              key={tag}
              id={`${idPrefix}-tag-${tag}`}
              className={draft.tags.includes(tag) ? 'tag-toggle tag-toggle--on' : 'tag-toggle'}
              aria-pressed={draft.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </FormModal>
  );
}
