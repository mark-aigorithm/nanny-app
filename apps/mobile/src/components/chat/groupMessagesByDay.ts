export function groupMessagesByDay<T extends { createdAt: string }>(
  messages: readonly T[],
): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const message of messages) {
    const dayKey = new Date(message.createdAt).toDateString();
    const last = groups[groups.length - 1];
    if (last && new Date(last.date).toDateString() === dayKey) {
      last.items.push(message);
    } else {
      groups.push({ date: message.createdAt, items: [message] });
    }
  }
  return groups;
}

export function formatMessageTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateDivider(isoDate: string, now: Date = new Date()): string {
  const date = new Date(isoDate);
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
