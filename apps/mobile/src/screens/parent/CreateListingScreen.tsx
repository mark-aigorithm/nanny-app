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
import { MARKETPLACE_CATEGORIES, CONDITION_OPTIONS } from '@mobile/constants';
import { colors } from '@mobile/theme';
import { styles } from './styles/create-listing-screen.styles';

const MAX_PHOTOS = 5;

export default function CreateListingScreen() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [location, setLocation] = useState('');

  const handlePublish = () => {
    // In production, validate and submit listing
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <Pressable style={styles.headerCloseButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>List an item</Text>
          <Pressable style={styles.headerPublishButton} onPress={handlePublish}>
            <Text style={styles.headerPublishText}>Publish</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo Upload Grid */}
        <View style={styles.photoSection}>
          <Text style={styles.photoSectionLabel}>Photos</Text>
          <View style={styles.photoGrid}>
            {Array.from({ length: MAX_PHOTOS }).map((_, index) => (
              <Pressable
                key={index}
                style={[styles.photoSlot, index === 0 && styles.photoSlotPrimary]}
              >
                {index === 0 ? (
                  <>
                    <Ionicons name="camera-outline" size={28} color={colors.primary} />
                    <Text style={styles.photoSlotLabel}>Cover</Text>
                  </>
                ) : (
                  <Ionicons name="add" size={24} color={colors.textMuted} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.textInput}
            placeholder="What are you selling?"
            placeholderTextColor={colors.textPlaceholder}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.textInput, styles.textInputMultiline]}
            placeholder="Describe condition, size, brand, etc."
            placeholderTextColor={colors.textPlaceholder}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Price */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Price</Text>
          <View style={styles.priceInputContainer}>
            <Text style={styles.pricePrefix}>$</Text>
            <TextInput
              style={styles.priceInput}
              placeholder="0.00"
              placeholderTextColor={colors.textPlaceholder}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Category */}
        <View style={styles.chipSection}>
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipRow}>
            {MARKETPLACE_CATEGORIES.map(cat => (
              <Pressable
                key={cat}
                style={[styles.chip, category === cat && styles.chipActive]}
                onPress={() => setCategory(category === cat ? null : cat)}
              >
                <Text
                  style={[styles.chipText, category === cat && styles.chipTextActive]}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Condition */}
        <View style={styles.chipSection}>
          <Text style={styles.fieldLabel}>Condition</Text>
          <View style={styles.chipRow}>
            {CONDITION_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[styles.chip, condition === opt.value && styles.chipActive]}
                onPress={() =>
                  setCondition(condition === opt.value ? null : opt.value)
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    condition === opt.value && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Location */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Location</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Enter your neighborhood"
            placeholderTextColor={colors.textPlaceholder}
            value={location}
            onChangeText={setLocation}
          />
        </View>

        {/* Publish Button */}
        <Pressable style={styles.publishButton} onPress={handlePublish}>
          <Text style={styles.publishButtonText}>Publish</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
