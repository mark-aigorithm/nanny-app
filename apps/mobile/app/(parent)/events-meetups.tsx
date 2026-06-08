import { Redirect } from 'expo-router';

export default function EventsMeetupsRedirect() {
  return (
    <Redirect
      href={{
        pathname: '/(parent)/community-feed',
        params: { filter: 'Events' },
      }}
    />
  );
}
