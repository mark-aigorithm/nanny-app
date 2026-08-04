import React, { useCallback, useRef } from 'react';
import { FlatList, Image, Pressable, Text, View, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';

import type { PublicCampaign } from '@nanny-app/shared';

import { useActiveCampaigns, useTrackClick, useTrackImpression } from '@mobile/hooks/useCampaigns';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
import { styles } from './styles/campaign-carousel.styles';

// A campaign is "seen" once ≥ 60% of its card is on screen; count it at most
// once per mount so a scroll back and forth doesn't inflate impressions.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 } as const;

export default function CampaignCarousel() {
  const router = useRouter();
  const { data: campaigns } = useActiveCampaigns();
  const trackImpression = useTrackImpression();
  const trackClick = useTrackClick();
  const setPendingPromoCode = usePendingPromoStore((s) => s.setPendingPromoCode);
  const seen = useRef<Set<number>>(new Set());

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const token of viewableItems) {
        const item = token.item as PublicCampaign;
        if (token.isViewable && !seen.current.has(item.id)) {
          seen.current.add(item.id);
          trackImpression.mutate(item.id);
        }
      }
    },
  ).current;

  const handlePress = useCallback(
    (campaign: PublicCampaign) => {
      trackClick.mutate(campaign.id);
      if (campaign.targetType === 'PACKAGE' && campaign.packageId != null) {
        router.push({
          pathname: '/(parent)/packages/checkout',
          params: { packageId: String(campaign.packageId) },
        } as never);
        return;
      }
      if (campaign.targetType === 'PROMO_CODE' && campaign.promoCode) {
        setPendingPromoCode(campaign.promoCode);
        router.push('/(parent)/book/booking-date-picker' as never);
      }
    },
    [router, setPendingPromoCode, trackClick],
  );

  if (!campaigns || campaigns.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Offers for you</Text>
      <FlatList
        horizontal
        data={campaigns}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => handlePress(item)}>
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
