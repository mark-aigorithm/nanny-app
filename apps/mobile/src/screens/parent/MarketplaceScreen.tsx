import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

const HEADER_HEIGHT = 110;
const BOTTOM_NAV_HEIGHT = 80;

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
        <Ionicons name="cube-outline" size={32} color="#c4c4c4" />
        <Pressable
          style={styles.favoriteButton}
          onPress={() => onToggleFavorite(product.id)}
        >
          <Ionicons
            name={product.favorited ? 'heart' : 'heart-outline'}
            size={18}
            color={product.favorited ? '#e57373' : '#7a7a7a'}
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
              <Ionicons name="chevron-back" size={24} color="#2e2e2e" />
            </Pressable>
            <Text style={styles.headerTitle}>Marketplace</Text>
            <Pressable style={styles.sellButton}>
              <Text style={styles.sellButtonText}>Sell</Text>
            </Pressable>
          </View>
          <View style={styles.searchBarContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#7a7a7a" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search baby gear, clothes, toys..."
                placeholderTextColor="#7a7a7a"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + 60,
    paddingBottom: BOTTOM_NAV_HEIGHT + 16,
    paddingHorizontal: 24,
    gap: 20,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fdfaf8',
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    color: '#2e2e2e',
  },
  sellButton: {
    borderWidth: 1.5,
    borderColor: '#97a591',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sellButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#97a591',
  },

  // Search bar
  searchBarContainer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  searchBar: {
    backgroundColor: 'rgba(227, 213, 202, 0.5)',
    borderRadius: 9999,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#2e2e2e',
  },

  // Filter chips
  filterChips: {
    marginHorizontal: -24,
  },
  filterChipsContent: {
    paddingHorizontal: 24,
    gap: 8,
  },
  chip: {
    backgroundColor: '#e3d5ca',
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: '#97a591',
  },
  chipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#2e2e2e',
  },
  chipTextActive: {
    color: '#fff',
  },

  // Product grid
  gridContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  gridColumn: {
    flex: 1,
    gap: 12,
  },

  // Product card
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  productImagePlaceholder: {
    backgroundColor: '#f5f5f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  productInfo: {
    padding: 12,
    gap: 2,
  },
  productName: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    color: '#2e2e2e',
  },
  productPrice: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    color: '#97a591',
  },
  productLocation: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#7a7a7a',
  },
});
