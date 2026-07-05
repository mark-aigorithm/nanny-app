import type { CareLogResponse, CareLogType } from '@nanny-app/shared';
import type { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';

export const CARE_LOG_FILTER_PILLS = ['All', 'Meals', 'Sleep', 'Play', 'Health'] as const;
export type CareLogFilterPill = (typeof CARE_LOG_FILTER_PILLS)[number];

export function careLogTypeLabel(type: CareLogType, customLabel: string | null): string {
  if (type === 'CUSTOM' && customLabel) return customLabel;
  switch (type) {
    case 'MEAL':
      return 'Meal';
    case 'NAP':
      return 'Nap';
    case 'DIAPER':
      return 'Diaper change';
    case 'ACTIVITY':
      return 'Activity';
    default:
      return 'Update';
  }
}

export function formatCareLogTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function filterCareLogs(
  logs: CareLogResponse[],
  filter: CareLogFilterPill,
): CareLogResponse[] {
  switch (filter) {
    case 'Meals':
      return logs.filter((entry) => entry.type === 'MEAL');
    case 'Sleep':
      return logs.filter((entry) => entry.type === 'NAP');
    case 'Play':
      return logs.filter((entry) => entry.type === 'ACTIVITY');
    case 'Health':
      return logs.filter((entry) => entry.type === 'DIAPER' || entry.type === 'CUSTOM');
    default:
      return logs;
  }
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function getCareLogDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const entryDay = startOfDay(date);
  if (entryDay.getTime() === today.getTime()) return 'Today';

  const yesterday = startOfDay(new Date());
  yesterday.setDate(yesterday.getDate() - 1);
  if (entryDay.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function groupCareLogsByDay(
  logs: CareLogResponse[],
): { title: string; items: CareLogResponse[] }[] {
  const sections: { title: string; items: CareLogResponse[] }[] = [];
  for (const entry of logs) {
    const title = getCareLogDayLabel(entry.occurredAt);
    const last = sections[sections.length - 1];
    if (last?.title === title) {
      last.items.push(entry);
    } else {
      sections.push({ title, items: [entry] });
    }
  }
  return sections;
}

export function careLogIcon(type: CareLogType): {
  name: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
} {
  switch (type) {
    case 'MEAL':
      return { name: 'restaurant-outline', backgroundColor: colors.warmLight };
    case 'NAP':
      return { name: 'moon-outline', backgroundColor: colors.tintPurple };
    case 'DIAPER':
      return { name: 'medkit-outline', backgroundColor: colors.errorLight };
    case 'ACTIVITY':
      return { name: 'happy-outline', backgroundColor: colors.tintYellow };
    case 'CUSTOM':
    default:
      return { name: 'document-text-outline', backgroundColor: colors.primaryMuted };
  }
}
