import { Redirect } from 'expo-router';

export default function CreateEventRedirect() {
  return (
    <Redirect
      href={{
        pathname: '/(parent)/create-post',
        params: { type: 'event', returnTo: 'community-feed', filter: 'Events' },
      }}
    />
  );
}
