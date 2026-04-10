export type NotificationType = 'booking' | 'activity' | 'social' | 'promo' | 'review';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  time: string;
  read: boolean;
}
