import React from 'react';
import { render } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import type { BottomNavTab } from '@mobile/components/BottomNav';

const mockBottomNav = jest.fn((_props: { activeTab: BottomNavTab }) => null);
jest.mock('@mobile/components/BottomNav', () => ({
  __esModule: true,
  default: (props: { activeTab: BottomNavTab }) => mockBottomNav(props),
}));

import ParentTabBar, { ROUTE_TO_TAB } from '@mobile/components/ParentTabBar';

// Only `state` is read; the rest of the tab-bar props are navigator plumbing.
function propsFor(routeNames: string[], index: number): BottomTabBarProps {
  return {
    state: {
      index,
      routes: routeNames.map((name) => ({ key: `${name}-key`, name })),
    },
  } as unknown as BottomTabBarProps;
}

const ROUTES = ['home', 'services', 'bookings', 'mother-profile', 'post-detail', 'notifications'];

beforeEach(() => {
  mockBottomNav.mockClear();
});

describe('ParentTabBar', () => {
  it('lights the tab that owns the focused route', () => {
    render(<ParentTabBar {...propsFor(ROUTES, ROUTES.indexOf('bookings'))} />);
    expect(mockBottomNav).toHaveBeenLastCalledWith({ activeTab: 'activity' });
  });

  it('maps secondary tab screens onto their section tab', () => {
    expect(ROUTE_TO_TAB.notifications).toBe('home');
    expect(ROUTE_TO_TAB['community-feed']).toBe('services');
    expect(ROUTE_TO_TAB.messages).toBe('account');
  });

  it('keeps the last tab lit and stops taking touches on a screen without the bar', () => {
    const { rerender, UNSAFE_root } = render(
      <ParentTabBar {...propsFor(ROUTES, ROUTES.indexOf('services'))} />,
    );
    rerender(<ParentTabBar {...propsFor(ROUTES, ROUTES.indexOf('post-detail'))} />);

    expect(mockBottomNav).toHaveBeenLastCalledWith({ activeTab: 'services' });
    const hidden = UNSAFE_root.findAll(
      (node) => node.props.pointerEvents === 'none' && node.props.accessibilityElementsHidden,
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('takes touches on a screen that carries the bar', () => {
    const { UNSAFE_root } = render(
      <ParentTabBar {...propsFor(ROUTES, ROUTES.indexOf('home'))} />,
    );
    const passThrough = UNSAFE_root.findAll((node) => node.props.pointerEvents === 'box-none');
    expect(passThrough.length).toBeGreaterThan(0);
  });
});
