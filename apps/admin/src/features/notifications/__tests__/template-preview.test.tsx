/** One preview, never two: the push banner when it pushes, else the inbox card, labelled with where it lands. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TemplatePreview } from '@admin/features/notifications/template-preview';

const show = (channel: 'PUSH' | 'IN_APP' | 'BOTH') =>
  render(<TemplatePreview title="Gift" body="A treat" imageUrl={null} channel={channel} linkLabel="View package" />);

describe('TemplatePreview', () => {
  it('shows the push banner once for push + inbox, and says it is also kept in the inbox', () => {
    show('BOTH');
    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Push notification + inbox')).toBeInTheDocument();
    expect(within(preview).getAllByText('Gift')).toHaveLength(1);
    expect(within(preview).getByText('Also kept in the app’s Notifications inbox.')).toBeInTheDocument();
    expect(within(preview).getByText('Tapping it opens: View package.')).toBeInTheDocument();
  });

  it('shows the inbox card, with its link button, for in-app only', () => {
    show('IN_APP');
    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Inbox')).toBeInTheDocument();
    expect(within(preview).queryByText('NannyNow')).not.toBeInTheDocument();
    expect(within(preview).getByText('View package')).toBeInTheDocument();
  });
});
