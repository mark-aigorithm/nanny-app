import { nannyStatusRoute } from '@mobile/lib/nannyStatusRoute';

describe('nannyStatusRoute', () => {
  it.each([
    ['APPROVED', '/(nanny)/dashboard'],
    ['PENDING_ID', '/(auth)/upload-id'],
    ['REJECTED', '/(auth)/upload-id'],
    ['PENDING_REVIEW', '/(auth)/pending-review'],
    [null, '/(auth)/pending-review'],
  ] as const)('%s → %s', (status, href) => {
    expect(nannyStatusRoute(status)).toBe(href);
  });
});
