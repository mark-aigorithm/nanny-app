import type { Ionicons } from '@expo/vector-icons';

export interface ActivityItem {
  id: string;
  type: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  time: string;
  description: string;
  thumbnail?: string;
  unread?: boolean;
}

export interface QuickEntry {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
}

export interface LogEntry {
  id: string;
  type: 'diaper' | 'meal' | 'nap';
  title: string;
  subtitle: string;
  time: string;
  iconBg: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export interface LiveActivityItem {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  borderColor: string;
  iconBg: string;
  iconColor: string;
}

export interface ChildInfo {
  name: string;
  age: string;
  lastActivity: string;
}
