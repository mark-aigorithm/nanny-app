export interface Conversation {
  id: string;
  name: string;
  preview: string;
  time: string;
  unreadCount?: number;
  isOnline?: boolean;
  isVerified?: boolean;
  opacity?: number;
  avatar: string;
}

export interface ChatMessage {
  id: string;
  type: 'sent' | 'received';
  text: string;
  time: string;
}
