import type { NotificationTemplateInput } from '@nanny-app/shared';
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_IMAGE_HEIGHT,
  NOTIFICATION_IMAGE_WIDTH,
  NOTIFICATION_TEMPLATE_NAME_MAX,
  NOTIFICATION_TITLE_MAX,
} from '@nanny-app/shared';
import { useEffect, useState, type ChangeEvent } from 'react';

import { ImageCropper } from '@admin/components/image-cropper';
import { Button } from '@admin/components/ui';
import { cropImageToFile, type PixelArea } from '@admin/lib/crop-image';
import { uploadImageToFirebase } from '@admin/lib/storage';

import { TEMPLATE_FIELD_ID, type TemplateField } from './template-issues';

type ContentValues = Pick<NotificationTemplateInput, 'name' | 'title' | 'body' | 'imageUrl'>;
type ContentField = 'name' | 'title' | 'body' | 'imageUrl';

type TemplateContentFieldsProps = {
  values: ContentValues;
  onChange: (patch: Partial<ContentValues>) => void;
  /** A text field was left — its problem may now show. */
  onBlurField: (field: TemplateField) => void;
  errors: Partial<Record<ContentField, string>>;
  readOnly: boolean;
  /** True while an image is being framed or uploaded; the editor holds Save until it settles. */
  onImageBusyChange: (busy: boolean) => void;
};

/** Name, title, message and image — the words and picture a mother sees. */
export function TemplateContentFields({
  values,
  onChange,
  onBlurField,
  errors,
  readOnly,
  onImageBusyChange,
}: TemplateContentFieldsProps) {
  return (
    <>
      <CountedField
        id={TEMPLATE_FIELD_ID.name}
        label="Name"
        hint="Only admins see this. It names the template in the list."
        value={values.name}
        max={NOTIFICATION_TEMPLATE_NAME_MAX}
        error={errors.name}
        disabled={readOnly}
        onChange={(name) => onChange({ name })}
        onBlur={() => onBlurField('name')}
      />
      <CountedField
        id={TEMPLATE_FIELD_ID.title}
        label="Title"
        hint="The bold first line. Phones cut long titles, so keep it short."
        value={values.title}
        max={NOTIFICATION_TITLE_MAX}
        error={errors.title}
        disabled={readOnly}
        onChange={(title) => onChange({ title })}
        onBlur={() => onBlurField('title')}
      />
      <CountedField
        id={TEMPLATE_FIELD_ID.body}
        label="Message"
        hint="Plain text. A push banner shows the first two lines; the inbox shows it all."
        value={values.body}
        max={NOTIFICATION_BODY_MAX}
        multiline
        error={errors.body}
        disabled={readOnly}
        onChange={(body) => onChange({ body })}
        onBlur={() => onBlurField('body')}
      />
      <ImageField
        imageUrl={values.imageUrl ?? null}
        onChange={(imageUrl) => onChange({ imageUrl })}
        readOnly={readOnly}
        error={errors.imageUrl}
        onBusyChange={onImageBusyChange}
      />
    </>
  );
}

type CountedFieldProps = {
  id: string;
  label: string;
  hint: string;
  value: string;
  max: number;
  multiline?: boolean;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

/**
 * A text field with a live character count. The count turns to a warning in
 * the last 10% and says how many are left, so it is not colour alone. The
 * browser stops typing at the limit, so it can never be over. Hint, count and
 * error are read out with the field via aria-describedby.
 */
function CountedField({ id, label, hint, value, max, multiline = false, error, disabled, onChange, onBlur }: CountedFieldProps) {
  const hintId = `${id}-hint`;
  const counterId = `${id}-count`;
  const errorId = `${id}-error`;
  const remaining = max - value.length;
  const warn = remaining <= Math.ceil(max * 0.1);
  const shared = {
    id,
    className: 'input',
    value,
    maxLength: max,
    disabled,
    // Arabic text reads right-to-left as it is typed.
    dir: 'auto' as const,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [hintId, counterId, error ? errorId : null].filter(Boolean).join(' '),
    onBlur,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? <textarea rows={4} {...shared} /> : <input type="text" {...shared} />}
      <div className="field-meta">
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
        <span id={counterId} className={`char-counter${warn ? ' char-counter--warn' : ''}`}>
          {value.length} / {max}
          {warn ? ` · ${remaining} left` : ''}
        </span>
      </div>
      {error && (
        <span className="field-error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

type ImageFieldProps = {
  imageUrl: string | null;
  onChange: (url: string | null) => void;
  readOnly: boolean;
  error?: string;
  onBusyChange: (busy: boolean) => void;
};

const IMAGE_HINT = `Optional. You’ll crop it to ${NOTIFICATION_IMAGE_WIDTH} × ${NOTIFICATION_IMAGE_HEIGHT} px (2:1). It shows in the inbox and on Android push banners; iPhone banners show the text only.`;

/** Pick → frame at 2:1 → upload to Firebase Storage `notifications/`. Remove clears it. */
function ImageField({ imageUrl, onChange, readOnly, error, onBusyChange }: ImageFieldProps) {
  const [pending, setPending] = useState<{ src: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const id = TEMPLATE_FIELD_ID.imageUrl;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // The object URL lives exactly as long as the crop it backs.
  const pendingSrc = pending?.src;
  useEffect(() => {
    if (!pendingSrc) return;
    return () => URL.revokeObjectURL(pendingSrc);
  }, [pendingSrc]);

  const busy = pending !== null || uploading;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    event.target.value = '';
    if (!file) return;
    setUploadError(null);
    setPending({ src: URL.createObjectURL(file), name: file.name });
  }

  async function confirm(area: PixelArea) {
    if (!pending) return;
    setUploading(true);
    setUploadError(null);
    try {
      const file = await cropImageToFile(
        pending.src,
        area,
        NOTIFICATION_IMAGE_WIDTH,
        NOTIFICATION_IMAGE_HEIGHT,
        pending.name,
      );
      onChange(await uploadImageToFirebase(file, 'notifications'));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'The image didn’t upload. Try again.');
    } finally {
      setUploading(false);
      setPending(null);
    }
  }

  if (readOnly) {
    return imageUrl ? (
      <div className="field">
        <span className="field-label">Image</span>
        <img className="notif-image-thumb" src={imageUrl} alt="The notification’s image" />
      </div>
    ) : null;
  }

  if (pending) {
    // Not a <label>: it would hand its name to the cropper's first control (Zoom).
    return (
      <div className="field" role="group" aria-labelledby={labelId} aria-describedby={hintId}>
        <span className="field-label" id={labelId}>
          Image
        </span>
        <ImageCropper
          src={pending.src}
          width={NOTIFICATION_IMAGE_WIDTH}
          height={NOTIFICATION_IMAGE_HEIGHT}
          busy={uploading}
          onCancel={() => setPending(null)}
          onConfirm={(area) => void confirm(area)}
          onError={() => {
            setUploadError('Couldn’t read that image. Try a JPEG or PNG.');
            setPending(null);
          }}
        />
        <span className="field-hint" id={hintId} role="status">
          {uploading ? 'Uploading the image…' : IMAGE_HINT}
        </span>
      </div>
    );
  }

  const message = uploadError ?? error;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        Image
      </label>
      {imageUrl && (
        <div className="notif-image-current">
          <img className="notif-image-thumb" src={imageUrl} alt="The notification’s current image" />
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove image
          </Button>
        </div>
      )}
      <input
        id={id}
        className="input"
        type="file"
        accept="image/*"
        onChange={pick}
        aria-invalid={message ? true : undefined}
        aria-describedby={[hintId, message ? errorId : null].filter(Boolean).join(' ')}
      />
      <span className="field-hint" id={hintId}>
        {IMAGE_HINT}
      </span>
      {message && (
        <span className="field-error" id={errorId} role="alert">
          {message}
        </span>
      )}
    </div>
  );
}
