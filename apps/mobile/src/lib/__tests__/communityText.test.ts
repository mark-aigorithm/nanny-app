import { textDirectionStyle } from '@mobile/lib/textDirection';
import { formatTimeAgo, postShareMessage } from '@mobile/lib/communityUtils';

describe('textDirectionStyle', () => {
  it('right-aligns text that starts in Arabic', () => {
    expect(textDirectionStyle('مساء الخير، is this OK?')).toEqual({
      textAlign: 'right',
      writingDirection: 'rtl',
    });
  });

  it('leaves English alone, even with Arabic later on', () => {
    expect(textDirectionStyle('Hello مساء الخير')).toBeUndefined();
  });

  it('looks past leading digits and punctuation', () => {
    expect(textDirectionStyle('#1 — مساء')).toEqual({ textAlign: 'right', writingDirection: 'rtl' });
  });

  it('handles empty text', () => {
    expect(textDirectionStyle(null)).toBeUndefined();
    expect(textDirectionStyle('')).toBeUndefined();
  });
});

describe('formatTimeAgo', () => {
  it('names the month after a week instead of a numeric date', () => {
    const twoWeeks = new Date(Date.now() - 14 * 86_400_000);
    const label = formatTimeAgo(twoWeeks.toISOString());
    expect(label).not.toMatch(/\//);
    expect(label).toContain(String(twoWeeks.getDate()));
  });
});

describe('postShareMessage', () => {
  it('carries the post and signs it with the app', () => {
    const message = postShareMessage({
      type: 'qa',
      title: null,
      body: 'Where do I buy a pram?',
    } as Parameters<typeof postShareMessage>[0]);
    expect(message).toContain('Where do I buy a pram?');
    expect(message).toContain('NannyNow community');
  });
});
