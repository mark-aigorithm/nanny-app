import { describe, expect, it } from 'vitest';

import { AdminCommunityPostListQuerySchema, RejectPostSchema } from '../admin';
import { ADMIN_SECTION_LABELS, ADMIN_SECTION_PATHS } from '../operator';

describe('AdminCommunityPostListQuerySchema', () => {
  it('defaults to the pending queue across every type', () => {
    expect(AdminCommunityPostListQuerySchema.parse({})).toMatchObject({
      type: 'ALL',
      status: 'PENDING',
    });
  });

  it('falls back rather than failing on an unknown filter value', () => {
    expect(
      AdminCommunityPostListQuerySchema.parse({ type: 'BOGUS', status: 'nope' }),
    ).toMatchObject({
      type: 'ALL',
      status: 'PENDING',
    });
  });
});

describe('RejectPostSchema', () => {
  it('requires a reason', () => {
    expect(RejectPostSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(RejectPostSchema.parse({ reason: ' Too blurry ' }).reason).toBe('Too blurry');
  });
});

describe('marketplace section', () => {
  it('is presented as Community while keeping its permission key', () => {
    expect(ADMIN_SECTION_LABELS.marketplace).toBe('Community');
    expect(ADMIN_SECTION_PATHS.marketplace).toBe('/community');
  });
});
