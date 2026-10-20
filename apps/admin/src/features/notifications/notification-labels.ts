import type {
  CampaignTargetType,
  NotificationBroadcastStatus,
  NotificationChannel,
} from '@nanny-app/shared';

type Tone = 'neutral' | 'success' | 'danger' | 'warning';

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  IN_APP: 'In-app',
  PUSH: 'Push',
  BOTH: 'In-app + push',
};

/** What each channel does, under the channel control. */
export const CHANNEL_HINT: Record<NotificationChannel, string> = {
  IN_APP: 'An entry in the app’s Notifications inbox. No phone notification.',
  PUSH: 'A phone notification only — nothing is kept in the inbox.',
  BOTH: 'A phone notification, and an entry in the app’s Notifications inbox.',
};

export const LINK_TYPE_LABEL: Record<CampaignTargetType, string> = {
  PACKAGE: 'Package',
  PROMO_CODE: 'Promo code',
};

export const BROADCAST_STATUS_LABEL: Record<NotificationBroadcastStatus, string> = {
  SENDING: 'Sending',
  SENT: 'Sent',
  PARTIAL: 'Partly sent',
  FAILED: 'Failed',
};

export const BROADCAST_STATUS_TONE: Record<NotificationBroadcastStatus, Tone> = {
  SENDING: 'neutral',
  SENT: 'success',
  PARTIAL: 'warning',
  FAILED: 'danger',
};

/** 1240 → "1,240". One number style for every count on these pages. */
export const formatCount = (n: number) => n.toLocaleString('en-US');

/** 1 → "1 mother", 1240 → "1,240 mothers". */
export const mothersLabel = (n: number) => `${formatCount(n)} ${n === 1 ? 'mother' : 'mothers'}`;

/** The action line a mother sees on the inbox card. */
export function linkActionLabel(targetType: CampaignTargetType | null, code: string | null): string | null {
  if (targetType === 'PACKAGE') return 'View package';
  if (targetType === 'PROMO_CODE') return code ? `Book with code ${code}` : 'Book with this code';
  return null;
}
