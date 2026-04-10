import type { FilterChipData, SortOption } from '@mobile/types';

export const HOME_FILTER_TABS = ['Full-time', 'Part-time', 'Occasional', 'Emergency'] as const;
export type FilterTab = (typeof HOME_FILTER_TABS)[number];

export const SORT_OPTIONS: SortOption[] = ['Recommended', 'Price', 'Distance'];

export const INITIAL_SEARCH_FILTERS: FilterChipData[] = [
  { id: 'rating', label: 'Rating 4.5+', dismissible: true },
  { id: 'cpr', label: 'CPR certified', dismissible: true },
  { id: 'ages', label: 'Ages 0\u20133', dismissible: true },
];
