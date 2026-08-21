/**
 * Proves the mobile Jest harness, in particular the native-module mocks added
 * to jest.setup.js. Each of these modules throws or returns undefined when
 * imported for real under jest, so a screen that touches one cannot render at
 * all — this file fails loudly if a global mock regresses, rather than leaving
 * the breakage to surface as a confusing failure inside a feature test.
 */
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

describe('mobile test harness', () => {
  it('renders a component tree', () => {
    const { getByText } = render(
      <View>
        <Text>Harness online</Text>
      </View>,
    );

    expect(getByText('Harness online')).toBeTruthy();
  });

  it('renders react-native-maps through the global stub', () => {
    const { getByText } = render(
      <MapView>
        <Marker coordinate={{ latitude: 30.0444, longitude: 31.2357 }}>
          <Text>Pin</Text>
        </Marker>
      </MapView>,
    );

    expect(getByText('Pin')).toBeTruthy();
  });

  it('resolves location permissions and a position', async () => {
    await expect(Location.requestForegroundPermissionsAsync()).resolves.toMatchObject({
      status: 'granted',
    });

    const position = await Location.getCurrentPositionAsync({});
    expect(position.coords.latitude).toBe(30.0444);
  });

  it('resolves notification permissions and a push token', async () => {
    await expect(Notifications.getPermissionsAsync()).resolves.toMatchObject({
      status: 'granted',
    });
    await expect(Notifications.getExpoPushTokenAsync()).resolves.toMatchObject({
      data: 'ExponentPushToken[test]',
    });
  });

  it('defaults the image picker to a cancelled selection', async () => {
    await expect(ImagePicker.launchImageLibraryAsync()).resolves.toMatchObject({
      canceled: true,
    });
  });
});
