import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  CAMPAIGN_IMAGE_HEIGHT,
  CAMPAIGN_IMAGE_WIDTH,
  type PublicCampaign,
} from '@nanny-app/shared';

import { PressableScale } from '@mobile/components/ui';
import { useActiveCampaigns, useTrackClick, useTrackImpression } from '@mobile/hooks/useCampaigns';
import { usePendingPromoStore } from '@mobile/store/pendingPromoStore';
import { screenPadding } from '@mobile/theme';
import { CARD_GAP, styles } from './styles/campaign-carousel.styles';

// A campaign is "seen" once ≥ 60% of its card is on screen; count it at most
// once per mount so a scroll back and forth doesn't inflate impressions.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 } as const;

// Banners are drawn at the size admins are asked to upload, so the artwork
// (which carries the offer's own text) is never cropped.
const IMAGE_RATIO = { aspectRatio: CAMPAIGN_IMAGE_WIDTH / CAMPAIGN_IMAGE_HEIGHT };

export default function CampaignCarousel() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { data: campaigns } = useActiveCampaigns();
  const trackImpression = useTrackImpression();
  const trackClick = useTrackClick();
  const setPendingPromoCode = usePendingPromoStore((s) => s.setPendingPromoCode);
  const seen = useRef<Set<number>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const token of viewableItems) {
      const item = token.item as PublicCampaign;
      if (token.isViewable && !seen.current.has(item.id)) {
        seen.current.add(item.id);
        trackImpression.mutate(item.id);
      }
    }
  }).current;

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

  const count = campaigns?.length ?? 0;
  // One offer at a time, as wide as the content; a swipe moves by one.
  const cardWidth = windowWidth - screenPadding * 2;
  const interval = cardWidth + CARD_GAP;

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / interval);
      setActiveIndex(Math.min(Math.max(index, 0), count - 1));
    },
    [interval, count],
  );

  if (!campaigns || count === 0) return null;

  return (
    <View style={styles.section}>
      <FlatList
        horizontal
        data={campaigns}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        snapToInterval={interval}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        renderItem={({ item }) => (
          <PressableScale
            style={[styles.card, { width: cardWidth }]}
            accessibilityRole="button"
            accessibilityLabel={item.subtitle ? `${item.title}. ${item.subtitle}` : item.title}
            onPress={() => handlePress(item)}
          >
            <Image source={{ uri: item.imageUrl }} style={[styles.image, IMAGE_RATIO]} />
          </PressableScale>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {count > 1 ? `Offer · ${activeIndex + 1} of ${count}` : 'Offer'}
          </Text>
        </View>
        {count > 1 ? (
          <View style={styles.dots}>
            {campaigns.map((c, i) => (
              <View key={c.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
