import { ScrollView, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@mobile/components';
import { colors, fontSizes, radii, shadows, spacing } from '@mobile/lib/theme';

const FILTERS = ['All Items', 'Toys', 'Clothes', 'Gear', 'Nursery', 'Strollers'];

const PRODUCTS = [
  { id: '1', title: 'Uppababy Cruz Stroller', price: 320, hood: 'Park Slope', tall: true },
  { id: '2', title: 'Baby Girl 3-6m Bundle', price: 45, hood: 'Williamsburg', tall: false },
  { id: '3', title: 'Wooden Toy Set', price: 28, hood: 'Cobble Hill', tall: false },
  { id: '4', title: 'Baby Brezza Dispenser', price: 65, hood: 'Boerum Hill', tall: true },
  { id: '5', title: 'IKEA Sniglar Crib', price: 150, hood: 'Carroll Gardens', tall: true },
  { id: '6', title: 'Boppy Nursing Pillow', price: 22, hood: 'Fort Greene', tall: false },
];

export default function MarketplaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const leftCol = PRODUCTS.filter((_, i) => i % 2 === 0);
  const rightCol = PRODUCTS.filter((_, i) => i % 2 !== 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Marketplace</Text>
        <Pressable style={styles.sellBtn}>
          <Text style={styles.sellText}>Sell</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search items..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f, i) => (
          <Chip key={f} label={f} active={i === 0} />
        ))}
      </ScrollView>

      {/* Masonry grid */}
      <View style={styles.grid}>
        <View style={styles.column}>
          {leftCol.map((p) => (
            <ProductCard key={p.id} {...p} />
          ))}
        </View>
        <View style={styles.column}>
          {rightCol.map((p) => (
            <ProductCard key={p.id} {...p} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function ProductCard({ title, price, hood, tall }: { title: string; price: number; hood: string; tall: boolean }) {
  return (
    <View style={styles.productCard}>
      <View style={[styles.productImage, { height: tall ? 160 : 120 }]}>
        <Text style={styles.productEmoji}>📦</Text>
        <Pressable style={styles.heartBtn}>
          <Text style={styles.heartIcon}>♡</Text>
        </Pressable>
      </View>
      <Text style={styles.productTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.productPrice}>${price}</Text>
      <Text style={styles.productHood}>{hood}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md, gap: spacing.md,
  },
  backArrow: { fontSize: 24, color: colors.textPrimary },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  sellBtn: {
    borderWidth: 1.5, borderColor: colors.communityPink, borderRadius: radii['2xl'],
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  sellText: { color: colors.communityPink, fontWeight: '700', fontSize: fontSizes.sm },

  searchContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  searchInput: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: fontSizes.base, color: colors.textPrimary,
  },

  filterRow: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },

  grid: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.md },
  column: { flex: 1, gap: spacing.md },

  productCard: {
    backgroundColor: colors.white, borderRadius: radii.lg, overflow: 'hidden',
    ...shadows.sm,
  },
  productImage: {
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  productEmoji: { fontSize: 32, opacity: 0.4 },
  heartBtn: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  heartIcon: { fontSize: 18, color: colors.textMuted },
  productTitle: {
    fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary,
    paddingHorizontal: spacing.sm, paddingTop: spacing.sm,
  },
  productPrice: {
    fontSize: fontSizes.base, fontWeight: '700', color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
  },
  productHood: {
    fontSize: fontSizes.xs, color: colors.textMuted,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.sm,
  },
});
