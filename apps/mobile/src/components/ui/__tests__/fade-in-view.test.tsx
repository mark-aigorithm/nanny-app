import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import FadeInView from '@mobile/components/ui/fade-in-view';

describe('FadeInView', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <FadeInView index={2}>
        <Text>How it works</Text>
      </FadeInView>,
    );
    expect(getByText('How it works')).toBeTruthy();
  });

  it('forwards view props such as testID', () => {
    const { getByTestId } = render(
      <FadeInView testID="home.section">
        <Text>Section</Text>
      </FadeInView>,
    );
    expect(getByTestId('home.section')).toBeTruthy();
  });
});
