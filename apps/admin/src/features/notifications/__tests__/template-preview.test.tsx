/** One preview, never two: the push banner when it pushes, else the inbox card, labelled with where it lands. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TemplatePreview } from '@admin/features/notifications/template-preview';

const show = (channel: 'PUSH' | 'IN_APP' | 'BOTH') =>
  render(
    <TemplatePreview
      title="Gift"
      body="A treat"
      imageUrl={null}
      channel={channel}
      linkLabel="View package"
    />,
  );

describe('TemplatePreview', () => {
  it('shows the push banner once for push + inbox, with no notes the Delivery card already gives', () => {
    show('BOTH');
    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Push notification + inbox')).toBeInTheDocument();
    expect(within(preview).getAllByText('Gift')).toHaveLength(1);
    expect(within(preview).queryByText(/inbox\.$|Tapping it opens/)).not.toBeInTheDocument();
  });

  it('says which phones show the image of a push', () => {
    render(
      <TemplatePreview
        title="Gift"
        body="A treat"
        imageUrl="https://x/y.png"
        channel="PUSH"
        linkLabel={null}
      />,
    );
    expect(
      screen.getByText('The image shows on Android, and on iPhones from app version 1.0.1.'),
    ).toBeInTheDocument();
  });

  it('shows the inbox card, with its link button, for in-app only', () => {
    show('IN_APP');
    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Inbox')).toBeInTheDocument();
    expect(within(preview).queryByText('NannyNow')).not.toBeInTheDocument();
    expect(within(preview).getByText('View package')).toBeInTheDocument();
  });
});
