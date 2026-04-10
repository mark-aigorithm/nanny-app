import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { ProductDetail, ProductItem } from '@mobile/types';
import { MOCK_PRODUCT_DETAIL, MOCK_SIMILAR_PRODUCTS } from '@mobile/mocks';
import { colors } from '@mobile/theme';
import { styles } from './styles/marketplace-item-detail-screen.styles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CONDITION_LABELS: Record<ProductDetail['condition'], string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

function SimilarProductCard({ product }: { product: ProductItem }) {
  return (
    <View style={styles.similarCard}>
      <View style={styles.similarImagePlaceholder}>
        <Ionicons name="cube-outline" size={28} color={colors.textMuted} />
      </View>
      <View style={styles.similarCardInfo}>
        <Text style={styles.similarCardName} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.similarCardPrice}>${product.price}</Text>
        <Text style={styles.similarCardLocation} numberOfLines={1}>
          {product.location}
        </Text>
      </View>
    </View>
  );
}

export default function MarketplaceItemDetailScreen() {
  const router = useRouter();
  const { productId: _productId } = useLocalSearchParams<{ productId: string }>();
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // In production, fetch by productId. For now, use mock data.
  const product = MOCK_PRODUCT_DETAIL;
  const similarProducts = MOCK_SIMILAR_PRODUCTS;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setActiveImageIndex(index);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Carousel */}
        <View style={styles.carouselContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={styles.carouselScroll}
          >
            {product.images.map((image, index) => (
              <View key={index} style={styles.carouselSlide}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.carouselImage} />
                ) : (
                  <Ionicons name="image-outline" size={48} color={colors.textMuted} />
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Page Indicators */}
        <View style={styles.indicatorContainer}>
          {product.images.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicatorDot,
                activeImageIndex === index && styles.indicatorDotActive,
              ]}
            />
          ))}
        </View>

        {/* Price + Condition */}
        <View style={styles.infoSection}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>${product.price}</Text>
            <View style={styles.conditionBadge}>
              <Text style={styles.conditionBadgeText}>
                {CONDITION_LABELS[product.condition]}
              </Text>
            </View>
          </View>
          <Text style={styles.title}>{product.name}</Text>
        </View>

        {/* Seller Info Card */}
        <View style={styles.sellerCard}>
          <View style={styles.sellerRow}>
            <Image
              source={{ uri: product.seller.avatar }}
              style={styles.sellerAvatar}
            />
            <View style={styles.sellerInfo}>
              <Text style={styles.sellerName}>{product.seller.name}</Text>
              <Text style={styles.sellerMeta}>
                Member since {product.seller.memberSince}
              </Text>
            </View>
          </View>
          <Text style={styles.sellerResponseTime}>
            {product.seller.responseTime}
          </Text>
          <Pressable style={styles.messageSellerButton}>
            <Text style={styles.messageSellerButtonText}>Message seller</Text>
          </Pressable>
        </View>

        {/* Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.descriptionText}>{product.description}</Text>
        </View>

        {/* Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <Text style={styles.detailValue}>{product.category}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{product.location}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Posted</Text>
            <Text style={styles.detailValue}>{product.postedDate}</Text>
          </View>
        </View>

        {/* Similar Items */}
        <View style={styles.similarSection}>
          <Text style={[styles.sectionTitle, styles.similarHeader]}>
            Similar items
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.similarScrollContent}
          >
            {similarProducts.map(item => (
              <SimilarProductCard key={item.id} product={item} />
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Header — floating over carousel */}
      <SafeAreaView style={styles.header} pointerEvents="box-none">
        <View style={styles.headerInner}>
          <Pressable style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={colors.textDark} />
          </Pressable>
          <Pressable style={styles.headerButton}>
            <Ionicons name="share-outline" size={20} color={colors.textDark} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
