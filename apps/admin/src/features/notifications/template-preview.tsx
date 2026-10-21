import type { NotificationChannel } from '@nanny-app/shared';

type TemplatePreviewProps = {
  title: string;
  body: string;
  imageUrl: string | null;
  channel: NotificationChannel;
  /** "View package" / "Book with code SAVE20"; null without a link. Shown on the inbox card. */
  linkLabel: string | null;
  /** The saved template's own screen, where the preview is the page. */
  wide?: boolean;
};

/** Where it lands, said once above the single preview. */
const DELIVERED_AS: Record<NotificationChannel, string> = {
  PUSH: 'Push notification',
  IN_APP: 'Inbox',
  BOTH: 'Push notification + inbox',
};

/**
 * What a mother sees, once: the push banner when the channel pushes, else the
 * inbox card, under a line saying where it's delivered. No notes under it:
 * where it lands and what a tap opens are in the Delivery details. The image sits in the
 * same fixed 2:1 box the app uses. A decorative copy of the form, so its image
 * has empty alt text.
 */
export function TemplatePreview({
  title,
  body,
  imageUrl,
  channel,
  linkLabel,
  wide = false,
}: TemplatePreviewProps) {
  const shownTitle = title.trim() || 'Your title';
  const shownBody = body.trim() || 'Your message';
  const sample = (filled: string) => (filled.trim() ? '' : ' notif-placeholder');
  const pushes = channel !== 'IN_APP';
  return (
    <aside className={`notif-preview${wide ? ' notif-preview--wide' : ''}`} aria-label="Preview">
      <div className="notif-preview-head">
        <h3 className="notif-preview-heading">Preview</h3>
        <span className="notif-preview-channel">{DELIVERED_AS[channel]}</span>
      </div>
      <figure className="notif-preview-block">
        <div className="notif-preview-stage">
          {pushes ? (
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
          ) : (
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
          )}
        </div>
      </figure>
    </aside>
  );
}
