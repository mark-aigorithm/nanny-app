import { Redirect } from 'expo-router';

export default function CreateListingRedirect() {
  return (
    <Redirect
      href={{
        pathname: '/(parent)/create-post',
        params: { type: 'marketplace', returnTo: 'community-feed', filter: 'Marketplace' },
      }}
    />
  );
}
