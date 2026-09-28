import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';

import {
  COMMUNITY_TAGS,
  CreateOfficialPostSchema,
  type AdminCommunityPost,
  type CommunityTag,
  type CreateOfficialPostInput,
  type UpdateOfficialPostInput,
} from '@nanny-app/shared';

import { Field, FormModal, useToast } from '@admin/components/ui';
import { createOfficialPost, updateOfficialPost } from '@admin/lib/api';
import { apiErrorMessage } from '@admin/lib/api-error';
import { fromDateTimeLocalInput, toPlatformDateTimeInput } from '@admin/lib/format';
import { firstIssueMessage } from '@admin/lib/form-errors';
import { uploadImageToFirebase } from '@admin/lib/storage';

const MAX_IMAGES = 4;

export type OfficialPostType = AdminCommunityPost['type'];

/** What the type is called in titles, buttons and toasts. */
const NOUN: Record<OfficialPostType, { noun: string; Noun: string }> = {
  marketplace: { noun: 'listing', Noun: 'Listing' },
  event: { noun: 'event', Noun: 'Event' },
  qa: { noun: 'Q&A', Noun: 'Q&A' },
};

type DraftState = {
  title: string;
  body: string;
  price: string;
  imageUrls: string[];
  tags: CommunityTag[];
  contactPhone: string;
  /** <input type="datetime-local"> value, platform wall-clock. */
  eventStartsAt: string;
  location: string;
  maxAttendees: string;
};

function emptyDraft(): DraftState {
  return {
    title: '',
    body: '',
    price: '',
    imageUrls: [],
    tags: [],
    contactPhone: '',
    eventStartsAt: '',
    location: '',
    maxAttendees: '',
  };
}

function draftFromPost(post: AdminCommunityPost): DraftState {
  return {
    title: post.title ?? '',
    body: post.body ?? '',
    price: post.price !== null ? String(post.price) : '',
    imageUrls: post.imageUrls,
    tags: post.tags.filter((tag): tag is CommunityTag =>
      (COMMUNITY_TAGS as readonly string[]).includes(tag),
    ),
    contactPhone: post.contactPhone ?? '',
    eventStartsAt: post.eventStartsAt ? toPlatformDateTimeInput(post.eventStartsAt) : '',
    location: post.location ?? '',
    maxAttendees: post.maxAttendees !== null ? String(post.maxAttendees) : '',
  };
}

const optionalText = (value: string) => (value.trim() ? value.trim() : undefined);
const optionalNumber = (value: string) => (value.trim() ? Number(value) : undefined);

/** The draft as the create schema expects it; the schema decides what's missing. */
function candidate(type: OfficialPostType, draft: DraftState): unknown {
  const shared = { imageUrls: draft.imageUrls, tags: draft.tags };
  switch (type) {
    case 'marketplace':
      return {
        type,
        title: draft.title.trim(),
        body: optionalText(draft.body),
        price: Number(draft.price),
        contactPhone: draft.contactPhone,
        ...shared,
      };
    case 'event':
      return {
        type,
        title: draft.title.trim(),
        body: optionalText(draft.body),
        eventStartsAt: fromDateTimeLocalInput(draft.eventStartsAt),
        location: draft.location.trim(),
        price: optionalNumber(draft.price),
        maxAttendees: optionalNumber(draft.maxAttendees),
        ...shared,
      };
    case 'qa':
      return { type, title: optionalText(draft.title), body: draft.body.trim(), ...shared };
  }
}

/**
 * The same post as an edit. A blank optional field becomes null, so clearing it
 * in the form clears it on the post (an event made free again, say) rather
 * than leaving the old value in place.
 */
function toUpdateInput(input: CreateOfficialPostInput): UpdateOfficialPostInput {
  switch (input.type) {
    case 'marketplace':
      return {
        title: input.title,
        body: input.body ?? null,
        price: input.price,
        imageUrls: input.imageUrls,
        tags: input.tags,
        contactPhone: input.contactPhone,
      };
    case 'event':
      return {
        title: input.title,
        body: input.body ?? null,
        eventStartsAt: input.eventStartsAt,
        location: input.location,
        price: input.price ?? null,
        maxAttendees: input.maxAttendees ?? null,
        imageUrls: input.imageUrls,
        tags: input.tags,
      };
    case 'qa':
      return {
        title: input.title ?? null,
        body: input.body,
        imageUrls: input.imageUrls,
        tags: input.tags,
      };
  }
}

type OfficialPostFormModalProps = {
  type: OfficialPostType;
  /** The official post to edit; omit to publish a new one. */
  post?: AdminCommunityPost;
  onClose: () => void;
};

/**
 * Publish an official event, Q&A or listing as NannyNow, or edit one. A new post
 * goes live at once (an admin wrote it, so it never enters the review queue),
 * and an edit never re-enters review either. Listings are pinned in the
 * marketplace feed; events and Q&A sit by date, badged Official.
 */
export function OfficialPostFormModal({ type, post, onClose }: OfficialPostFormModalProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { noun, Noun } = NOUN[type];
  const [draft, setDraft] = useState<DraftState>(() => (post ? draftFromPost(post) : emptyDraft()));
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (save: () => Promise<AdminCommunityPost>) => save(),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      toast.success(
        post ? `${Noun} updated` : `Official ${noun} published`,
        saved.title ?? saved.body ?? '',
      );
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
    if (type === 'event' && !draft.eventStartsAt) {
      return setFormError('Pick the event’s date and time.');
    }
    const parsed = CreateOfficialPostSchema.safeParse(candidate(type, draft));
    if (!parsed.success) return setFormError(firstIssueMessage(parsed.error));
    const input = parsed.data;
    saveMutation.mutate(() =>
      post ? updateOfficialPost(post.id, toUpdateInput(input)) : createOfficialPost(input),
    );
  }

  const set = (patch: Partial<DraftState>) => setDraft((current) => ({ ...current, ...patch }));

  const toggleTag = (tag: CommunityTag) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((t) => t !== tag)
        : current.tags.slice(0, 4).concat(tag),
    }));

  const idPrefix = post ? `official-${post.id}` : `new-${type}`;
  const photosRequired = type === 'marketplace';

  return (
    <FormModal
      title={post ? `Edit official ${noun}` : `New official ${noun}`}
      submitLabel={post ? 'Save changes' : `Publish ${noun}`}
      busy={saveMutation.isPending}
      submitDisabled={uploading}
      error={formError}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="form-grid">
        {type === 'marketplace' && (
          <>
            <Field label="Product name">
              <input
                value={draft.title}
                autoFocus
                onChange={(e) => set({ title: e.target.value })}
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
                onChange={(e) => set({ price: e.target.value })}
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
                onChange={(e) => set({ contactPhone: e.target.value })}
                placeholder="+20 100 123 4567"
                required
              />
            </Field>
            <Field label="Description" hint="Optional — shown under the photos.">
              <input
                value={draft.body}
                onChange={(e) => set({ body: e.target.value })}
                placeholder="Brand new, sealed box"
              />
            </Field>
          </>
        )}

        {type === 'event' && (
          <>
            <Field label="Event name">
              <input
                value={draft.title}
                autoFocus
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Mommy & me picnic"
                required
              />
            </Field>
            <Field label="Date and time">
              <input
                type="datetime-local"
                value={draft.eventStartsAt}
                onChange={(e) => set({ eventStartsAt: e.target.value })}
                required
              />
            </Field>
            <Field label="Location">
              <input
                value={draft.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Merryland Park, Heliopolis"
                required
              />
            </Field>
            <Field label="Price (EGP)" hint="Leave blank for a free event.">
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
                placeholder="Free"
              />
            </Field>
            <Field label="Max attendees" hint="Optional — leave blank for no limit.">
              <input
                type="number"
                min="1"
                step="1"
                value={draft.maxAttendees}
                onChange={(e) => set({ maxAttendees: e.target.value })}
                placeholder="No limit"
              />
            </Field>
          </>
        )}

        {type === 'qa' && (
          <Field label="Title" hint="Optional — a headline above the post.">
            <input
              value={draft.title}
              autoFocus
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Summer opening hours"
            />
          </Field>
        )}

        <Field
          label="Photos"
          hint={
            uploading
              ? 'Uploading…'
              : `${draft.imageUrls.length}/${MAX_IMAGES} uploaded.${photosRequired ? ' At least one is required.' : ' Optional.'}`
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

      {type !== 'marketplace' && (
        <Field
          label={type === 'qa' ? 'Body' : 'Description'}
          hint={type === 'qa' ? undefined : 'Optional — what to expect, what to bring.'}
        >
          <textarea
            className="input"
            rows={4}
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder={
              type === 'qa'
                ? 'What would you like to tell or ask the community?'
                : 'Blankets and snacks provided.'
            }
          />
        </Field>
      )}

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
                  onClick={() => set({ imageUrls: draft.imageUrls.filter((u) => u !== url) })}
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
