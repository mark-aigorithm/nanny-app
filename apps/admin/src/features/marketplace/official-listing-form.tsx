import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import {
  COMMUNITY_TAGS,
  CreateOfficialListingSchema,
  type AdminMarketplaceListing,
  type CommunityTag,
  type CreateOfficialListingInput,
} from '@nanny-app/shared';

import { Button, Card, Feedback, Field, Modal, useToast } from '@admin/components/ui';
import { createOfficialListing } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
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

function draftFromListing(listing: AdminMarketplaceListing): DraftState {
  return {
    title: listing.title,
    body: listing.body ?? '',
    price: listing.price !== null ? String(listing.price) : '',
    imageUrls: listing.imageUrls,
    tags: listing.tags.filter((tag): tag is CommunityTag =>
      (COMMUNITY_TAGS as readonly string[]).includes(tag),
    ),
    contactPhone: listing.contactPhone ?? '',
  };
}

/**
 * Validate a draft against the shared schema — the same one the API validates
 * with, so the console can't submit something the backend would reject.
 */
function parseDraft(draft: DraftState):
  | { ok: true; input: CreateOfficialListingInput }
  | { ok: false; message: string } {
  const parsed = CreateOfficialListingSchema.safeParse({
    title: draft.title.trim(),
    body: draft.body.trim() ? draft.body.trim() : undefined,
    price: Number(draft.price),
    imageUrls: draft.imageUrls,
    tags: draft.tags,
    contactPhone: draft.contactPhone,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message ?? 'Invalid input' };
  }
  return { ok: true, input: parsed.data };
}

/** Shared field set — used by both the create card and the edit modal. */
function ListingFields({
  draft,
  setDraft,
  uploading,
  onImage,
  idPrefix,
}: {
  draft: DraftState;
  setDraft: (next: DraftState) => void;
  uploading: boolean;
  onImage: (event: ChangeEvent<HTMLInputElement>) => void;
  idPrefix: string;
}) {
  const toggleTag = (tag: CommunityTag) =>
    setDraft({
      ...draft,
      tags: draft.tags.includes(tag)
        ? draft.tags.filter((t) => t !== tag)
        : draft.tags.slice(0, 4).concat(tag),
    });

  return (
    <>
      <div className="form-grid">
        <Field label="Product name">
          <input
            value={draft.title}
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
          hint={`${draft.imageUrls.length}/${MAX_IMAGES} uploaded. At least one is required.`}
        >
          <input
            type="file"
            accept="image/*"
            disabled={uploading || draft.imageUrls.length >= MAX_IMAGES}
            onChange={onImage}
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
              className={
                draft.tags.includes(tag) ? 'tag-toggle tag-toggle--on' : 'tag-toggle'
              }
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Publish an official ("Sold by NannyNow") listing. It goes live immediately —
 * an admin authored it, so it never enters the review queue — and is pinned
 * above seller listings in the app's marketplace feed.
 */
export function OfficialListingForm() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createOfficialListing,
    onSuccess: (listing) => {
      void queryClient.invalidateQueries({ queryKey: ['marketplace-listings'] });
      setDraft(emptyDraft());
      toast.success('Official listing published', listing.title);
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    setFormError(null);
    createMutation.mutate(parsed.input);
  }

  return (
    <Card title="Publish an official listing">
      <form onSubmit={handleSubmit}>
        <ListingFields
          draft={draft}
          setDraft={setDraft}
          uploading={uploading}
          onImage={(e) => void handleImage(e)}
          idPrefix="new-listing"
        />
        {formError && <Feedback tone="error">{formError}</Feedback>}
        <Button type="submit" disabled={createMutation.isPending || uploading}>
          {uploading
            ? 'Uploading…'
            : createMutation.isPending
              ? 'Publishing…'
              : 'Publish listing'}
        </Button>
      </form>
    </Card>
  );
}

/** Edit an already-published official listing. Never re-enters review. */
export function OfficialListingEditModal({
  listing,
  busy,
  onCancel,
  onSave,
}: {
  listing: AdminMarketplaceListing;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: CreateOfficialListingInput) => void;
}) {
  const [draft, setDraft] = useState<DraftState>(() => draftFromListing(listing));
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function handleSave() {
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    setFormError(null);
    onSave(parsed.input);
  }

  return (
    <Modal
      title="Edit official listing"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy || uploading} onClick={handleSave}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <ListingFields
        draft={draft}
        setDraft={setDraft}
        uploading={uploading}
        onImage={(e) => void handleImage(e)}
        idPrefix={`listing-${listing.id}`}
      />
      {formError && <Feedback tone="error">{formError}</Feedback>}
    </Modal>
  );
}
