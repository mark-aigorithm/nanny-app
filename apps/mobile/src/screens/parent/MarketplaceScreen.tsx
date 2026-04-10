import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import { colors } from '@mobile/theme';
import { styles } from './styles/marketplace-screen.styles';

type CategoryChip = 'All items' | 'Toys' | 'Clothes' | 'Gear' | 'Nursery' | 'Strollers';

const CATEGORY_CHIPS: CategoryChip[] = [
  'All items',
  'Toys',
  'Clothes',
  'Gear',
  'Nursery',
  'Strollers',
];

interface ProductItem {
  id: string;
  name: string;
  price: number;
  location: string;
  imageHeight: number;
  favorited: boolean;
}

// ASSUMPTION: Product data will come from GET /marketplace/listings.
// Using hardcoded mock data until the backend service is ready.
const MOCK_PRODUCTS: ProductItem[] = [
  {
    id: '1',
    name: 'Premium Stroller',
    price: 320,
    location: 'Chelsea, NY',
    imageHeight: 180,
    favorited: false,
  },
  {
    id: '2',
    name: 'Newborn Bundle',
    price: 45,
    location: 'Brooklyn, NY',
    imageHeight: 130,
    favorited: false,
  },
  {
    id: '3',
    name: 'Wooden Toy Set',
    price: 28,
    location: 'Upper East Side',
    imageHeight: 150,
    favorited: false,
  },
  {
    id: '4',
    name: 'Smart Dispenser',
    price: 65,
    location: 'SoHo, NY',
    imageHeight: 180,
    favorited: false,
  },
  {
    id: '5',
    name: 'Natural Wood Crib',
    price: 150,
    location: 'Jersey City',
    imageHeight: 120,
    favorited: false,
  },
  {
    id: '6',
    name: 'Nursing Pillow',
    price: 22,
    location: 'Williamsburg',
    imageHeight: 160,
    favorited: false,
  },
];

function ProductCard({
  product,
  onToggleFavorite,
}: {
  product: ProductItem;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <View style={styles.productCard}>
      <View style={[styles.productImagePlaceholder, { height: product.imageHeight }]}>
        <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
        <Pressable
          style={styles.favoriteButton}
          onPress={() => onToggleFavorite(product.id)}
        >
          <Ionicons
            name={product.favorited ? 'heart' : 'heart-outline'}
            size={18}
            color={product.favorited ? colors.favorited : colors.textMuted}
          />
        </Pressable>
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.productPrice}>${product.price}</Text>
        <Text style={styles.productLocation} numberOfLines={1}>
          {product.location}
        </Text>
      </View>
    </View>
  );
}

export default function MarketplaceScreen() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<CategoryChip>('All items');
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<ProductItem[]>(MOCK_PRODUCTS);

  const handleToggleFavorite = (id: string) => {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, favorited: !p.favorited } : p)),
    );
  };

  // Split products into two columns for masonry layout
  const leftColumn: ProductItem[] = [];
  const rightColumn: ProductItem[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  for (const product of products) {
    const cardHeight = product.imageHeight + 80; // image + info area estimate
    if (leftHeight <= rightHeight) {
      leftColumn.push(product);
      leftHeight += cardHeight;
    } else {
      rightColumn.push(product);
      rightHeight += cardHeight;
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsContent}
          style={styles.filterChips}
        >
          {CATEGORY_CHIPS.map(chip => (
            <Pressable
              key={chip}
              style={[styles.chip, activeCategory === chip && styles.chipActive]}
              onPress={() => setActiveCategory(chip)}
            >
              <Text style={[styles.chipText, activeCategory === chip && styles.chipTextActive]}>
                {chip}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Product Grid — two-column masonry */}
        <View style={styles.gridContainer}>
          <View style={styles.gridColumn}>
            {leftColumn.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </View>
          <View style={styles.gridColumn}>
            {rightColumn.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Header — overlays scroll content */}
      <View style={styles.header} pointerEvents="box-none">
        <SafeAreaView>
          <View style={styles.headerInner}>
            <Pressable onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color={colors.textDark} />
            </Pressable>
            <Text style={styles.headerTitle}>Marketplace</Text>
            <Pressable style={styles.sellButton}>
              <Text style={styles.sellButtonText}>Sell</Text>
            </Pressable>
          </View>
          <View style={styles.searchBarContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search baby gear, clothes, toys..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
        </SafeAreaView>
      </View>

      <BottomNav activeTab="search" />
    </View>
  );
}

