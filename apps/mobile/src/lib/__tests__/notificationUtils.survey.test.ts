jest.mock('@expo/vector-icons', () => ({ Ionicons: { glyphMap: {} } }));

import { getNotificationIcon } from '@mobile/lib/notificationUtils';

describe('survey notification icon', () => {
  it('uses the clipboard the profile Surveys card shows, not the generic bell', () => {
    expect(getNotificationIcon('survey').name).toBe('clipboard-outline');
  });
});
