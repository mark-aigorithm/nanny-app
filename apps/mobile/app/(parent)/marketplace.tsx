import { Redirect } from 'expo-router';

export default function MarketplaceRedirect() {
  return (
    <Redirect
      href={{
        pathname: '/(parent)/community-feed',
        params: { filter: 'Marketplace' },
      }}
    />
  );
}
