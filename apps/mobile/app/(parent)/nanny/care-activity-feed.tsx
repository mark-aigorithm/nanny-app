import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy route — care log now lives on booking details. */
export default function CareActivityFeedRedirect() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  if (bookingId) {
    return (
      <Redirect
        href={{
          pathname: '/(parent)/book/booking-detail',
          params: { bookingId, returnTo: 'bookings' },
        }}
      />
    );
  }

  return <Redirect href="/(parent)/bookings" />;
}
