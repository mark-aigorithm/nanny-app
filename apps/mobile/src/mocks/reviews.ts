import type { NannyReview } from '@mobile/types';

export const MOCK_REVIEWS: NannyReview[] = [
  {
    id: '1',
    authorInitial: 'S',
    authorName: 'Sarah Jenkins',
    timeAgo: '2 weeks ago',
    rating: 5,
    text: 'Elena was absolutely wonderful with our twins. She kept them engaged with creative activities all day and even helped with light tidying. We felt completely at ease leaving them in her care.',
  },
  {
    id: '2',
    authorInitial: 'M',
    authorName: 'Michael Ross',
    timeAgo: '1 month ago',
    rating: 4,
    text: 'Very professional and reliable. Our son loved spending time with Elena. She was always on time and communicated well throughout the day.',
  },
];
