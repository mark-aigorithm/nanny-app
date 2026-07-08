import { Redirect, useLocalSearchParams } from 'expo-router';

export default function MarketplaceItemDetailRedirect() {
  const { productId, postId } = useLocalSearchParams<{
    productId?: string;
    postId?: string;
  }>();
  const id = postId ?? productId ?? '';
  return (
    <Redirect
      href={{
        pathname: '/(parent)/post-detail',
        params: { postId: id, returnTo: 'community-feed', filter: 'Marketplace' },
      }}
    />
  );
}
