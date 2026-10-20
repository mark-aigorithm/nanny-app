import type { UserGroupKind } from '@nanny-app/shared';

export const GROUP_KIND_LABEL: Record<UserGroupKind, string> = { STATIC: 'Static', DYNAMIC: 'Dynamic' };

/** A dynamic group gets the sage fill so the two kinds differ by more than their word. */
export const GROUP_KIND_TONE: Record<UserGroupKind, 'neutral' | 'success'> = {
  STATIC: 'neutral',
  DYNAMIC: 'success',
};

export const GROUP_KIND_HINT: Record<UserGroupKind, string> = {
  STATIC: 'Hand-picked mothers. You add and remove them yourself.',
  DYNAMIC: 'Mothers who match rules you set, worked out again every time something is sent.',
};
