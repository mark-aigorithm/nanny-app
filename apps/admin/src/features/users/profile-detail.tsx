import type { ReactNode } from 'react';

import { idTypeRequiresBack, type IdDocumentType } from '@nanny-app/shared';

import {
  Badge,
  Card,
  CircleCheck,
  CircleOff,
  CopyButton,
  ICON_SIZE,
  Mail,
  Phone,
} from '@admin/components/ui';
import { initials } from '@admin/lib/format';

/**
 * Building blocks shared by the nanny and mother detail pages, so both
 * records read the same way: a summary card up top, then an Application card
 * with the ID photos beside the rest of the record.
 */

export const ID_TYPE_LABEL: Record<IdDocumentType, string> = {
  PASSPORT: 'Passport',
  NATIONAL_ID: 'National ID',
};

type ProfileSummaryProps = {
  name: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  /** Status pills shown before the verification badges. */
  badges?: ReactNode;
};

/** Who she is at a glance: photo, status, verification and how to reach her. */
export function ProfileSummary({
  name,
  avatarUrl,
  email,
  phone,
  isEmailVerified,
  isPhoneVerified,
  badges,
}: ProfileSummaryProps) {
  return (
    <Card className="profile-summary">
      {avatarUrl ? (
        <img className="profile-summary-avatar" src={avatarUrl} alt="" />
      ) : (
        <span className="profile-summary-avatar profile-summary-avatar--fallback" aria-hidden>
          {initials(name)}
        </span>
      )}
      <div className="profile-summary-body">
        <div className="profile-summary-badges">
          {badges}
          <VerifiedBadge label="Email" verified={isEmailVerified} />
          <VerifiedBadge label="Phone" verified={isPhoneVerified} />
        </div>
        <ul className="profile-summary-contact">
          <li>
            <Mail size={ICON_SIZE.inline} aria-label="Email" />
            <a className="profile-summary-link" href={`mailto:${email}`}>
              {email}
            </a>
            <CopyButton value={email} label="Email" />
          </li>
          <li>
            <Phone size={ICON_SIZE.inline} aria-label="Phone" />
            {phone ? (
              <>
                <a className="profile-summary-link" href={`tel:${telNumber(phone)}`}>
                  {phone}
                </a>
                <CopyButton value={phone} label="Phone number" />
              </>
            ) : (
              <span className="table-empty">—</span>
            )}
          </li>
        </ul>
      </div>
    </Card>
  );
}

/** A dialable `tel:` target: digits and a leading +, without spaces or dashes. */
function telNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function VerifiedBadge({ label, verified }: { label: string; verified: boolean }) {
  const Icon = verified ? CircleCheck : CircleOff;
  return (
    <Badge tone={verified ? 'success' : 'neutral'}>
      <span className="badge-with-icon">
        <Icon size={12} aria-hidden />
        {label} {verified ? 'verified' : 'not verified'}
      </span>
    </Badge>
  );
}

type IdPhotosSubject = {
  name: string;
  idDocumentType: IdDocumentType | null;
  idDocumentFrontUrl: string | null;
  idDocumentBackUrl: string | null;
};

/**
 * Her ID, front and back, right where the application is decided. Clicking
 * opens the full-size viewer. A passport has no back side.
 */
export function IdPhotos({ subject, onOpen }: { subject: IdPhotosSubject; onOpen: () => void }) {
  if (!subject.idDocumentFrontUrl && !subject.idDocumentBackUrl) {
    return <p className="table-subtext">No ID uploaded yet.</p>;
  }
  const showBack = subject.idDocumentType == null || idTypeRequiresBack(subject.idDocumentType);
  return (
    <button
      type="button"
      className="id-review-thumbs profile-id-photos"
      onClick={onOpen}
      title="Click to enlarge"
    >
      <span className="id-review-thumb">
        {subject.idDocumentFrontUrl ? (
          <img src={subject.idDocumentFrontUrl} alt={`Front of ${subject.name}'s ID`} />
        ) : (
          <span className="id-review-thumb-empty">No front image</span>
        )}
        <span className="id-review-thumb-tag">Front</span>
      </span>
      {showBack && (
        <span className="id-review-thumb">
          {subject.idDocumentBackUrl ? (
            <img src={subject.idDocumentBackUrl} alt={`Back of ${subject.name}'s ID`} />
          ) : (
            <span className="id-review-thumb-empty">No back image</span>
          )}
          <span className="id-review-thumb-tag">Back</span>
        </span>
      )}
    </button>
  );
}
