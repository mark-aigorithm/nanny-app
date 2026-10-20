import type { NotificationChannel } from '@nanny-app/shared';

type TemplatePreviewProps = {
  title: string;
  body: string;
  imageUrl: string | null;
  channel: NotificationChannel;
  /** "View package" / "Book with code SAVE20"; null without a link. */
  linkLabel: string | null;
};

/**
 * What a mother sees: the push banner (when the channel pushes) and the inbox
 * card (when it writes to the inbox), the image in the same fixed 2:1 box the
 * app uses. A decorative copy of the form, so its image has empty alt text.
 */
export function TemplatePreview({ title, body, imageUrl, channel, linkLabel }: TemplatePreviewProps) {
  const shownTitle = title.trim() || 'Your title';
  const shownBody = body.trim() || 'Your message';
  const sample = (filled: string) => (filled.trim() ? '' : ' notif-placeholder');
  return (
    <aside className="notif-preview" aria-label="Preview">
      <h3 className="notif-preview-heading">Preview</h3>
      {channel !== 'IN_APP' && (
        <figure className="notif-preview-block">
          <figcaption>Push notification</figcaption>
          <div className="notif-push">
            <div className="notif-push-head">
              <span className="notif-push-app" aria-hidden>
                N
              </span>
              <span>NannyNow</span>
              <span className="notif-push-time">now</span>
            </div>
            <p className={`notif-push-title${sample(title)}`} dir="auto">
              {shownTitle}
            </p>
            <p className={`notif-push-body${sample(body)}`} dir="auto">
              {shownBody}
            </p>
            {imageUrl && (
              <div className="notif-image-box">
                <img src={imageUrl} alt="" />
              </div>
            )}
          </div>
          {imageUrl && <p className="notif-preview-note">Android shows the image; iPhones show the text only.</p>}
        </figure>
      )}
      {channel !== 'PUSH' && (
        <figure className="notif-preview-block">
          <figcaption>Inbox</figcaption>
          <div className="notif-card">
            {imageUrl && (
              <div className="notif-image-box">
                <img src={imageUrl} alt="" />
              </div>
            )}
            <p className={`notif-card-title${sample(title)}`} dir="auto">
              {shownTitle}
            </p>
            <p className={`notif-card-body${sample(body)}`} dir="auto">
              {shownBody}
            </p>
            {linkLabel && <span className="notif-card-action">{linkLabel}</span>}
          </div>
        </figure>
      )}
    </aside>
  );
}
