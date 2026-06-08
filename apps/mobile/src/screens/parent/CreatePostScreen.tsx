import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COMMUNITY_TAGS, type CreateCommunityPostRequest } from '@nanny-app/shared';

import { useCreatePost } from '@mobile/hooks/useCommunity';
import { uiTypeToCreate, getCreatePostExitHref } from '@mobile/lib/communityUtils';
import type { CreatePostUiType } from '@mobile/types';
import { uploadImageToFirebase } from '@mobile/lib/storage';
import { colors } from '@mobile/theme';
import { styles } from './styles/create-post-screen.styles';

const POST_TYPES: CreatePostUiType[] = ['Q&A', 'Marketplace', 'Event'];

function sanitizeDecimal(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function sanitizeInteger(value: string) {
  return value.replace(/[^0-9]/g, '');
}

export default function CreatePostScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; returnTo?: string; filter?: string }>();
  const initialType =
    params.type === 'marketplace' || params.type === 'event' || params.type === 'qa'
      ? params.type === 'qa'
        ? 'Q&A'
        : params.type === 'marketplace'
          ? 'Marketplace'
          : 'Event'
      : 'Q&A';

  const [postType, setPostType] = useState<CreatePostUiType>(initialType);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [eventDate, setEventDate] = useState(new Date(Date.now() + 86_400_000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTags, setSelectedTags] = useState<(typeof COMMUNITY_TAGS)[number][]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createPost = useCreatePost();

  const exitCreatePost = () => {
    router.replace(getCreatePostExitHref(params) as never);
  };

  const canPost =
    postType === 'Q&A'
      ? body.trim().length > 0
      : postType === 'Marketplace'
        ? title.trim().length > 0 && price.trim().length > 0 && !!imageUri
        : title.trim().length > 0 && location.trim().length > 0;

  const handleToggleTag = (tag: (typeof COMMUNITY_TAGS)[number]) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev,
    );
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let imageUrls: string[] = [];
      if (imageUri) {
        const url = await uploadImageToFirebase(imageUri, 'community-posts');
        imageUrls = [url];
      }

      const apiType = uiTypeToCreate(postType);
      let payload: CreateCommunityPostRequest;

      if (apiType === 'qa') {
        payload = {
          type: 'qa',
          body: body.trim(),
          title: title.trim() || undefined,
          tags: selectedTags,
          imageUrls,
        };
      } else if (apiType === 'marketplace') {
        payload = {
          type: 'marketplace',
          title: title.trim(),
          body: body.trim() || undefined,
          price: Number(price),
          tags: selectedTags,
          imageUrls,
        };
      } else {
        payload = {
          type: 'event',
          title: title.trim(),
          body: body.trim() || undefined,
          location: location.trim(),
          eventStartsAt: eventDate.toISOString(),
          price: price.trim() ? Number(price) : undefined,
          maxAttendees: maxAttendees.trim() ? Number(maxAttendees) : undefined,
          tags: selectedTags,
          imageUrls,
        };
      }

      await createPost.mutateAsync(payload);
      exitCreatePost();
    } catch (err) {
      Alert.alert('Could not create post', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={exitCreatePost} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Create post</Text>
        <Pressable
          style={[styles.postButton, (!canPost || submitting) && styles.postButtonDisabled]}
          disabled={!canPost || submitting}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.fieldGroup}>
          <Text style={styles.sectionLabel}>Post type</Text>
          <View style={styles.typeChipsRow}>
            {POST_TYPES.map((type) => {
              const isActive = type === postType;
              return (
                <Pressable
                  key={type}
                  style={[styles.typeChip, isActive && styles.typeChipActive]}
                  onPress={() => setPostType(type)}
                >
                  <Text style={[styles.typeChipText, isActive && styles.typeChipTextActive]}>
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {(postType === 'Marketplace' || postType === 'Event') && (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              {postType === 'Marketplace' ? 'Product name' : 'Event name'}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder={postType === 'Marketplace' ? 'e.g. Stroller, clothes bundle…' : 'e.g. Moms coffee morning'}
              placeholderTextColor={colors.textPlaceholder}
              value={title}
              onChangeText={setTitle}
            />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            {postType === 'Q&A' ? 'Your question' : 'Description'}
            {postType !== 'Q&A' && <Text style={styles.fieldOptional}> (optional)</Text>}
          </Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder={
              postType === 'Q&A'
                ? "What's on your mind?"
                : 'Add a few details to help others…'
            }
            placeholderTextColor={colors.textPlaceholder}
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
          />
        </View>

        {postType === 'Marketplace' && (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Price</Text>
            <View style={styles.priceInputContainer}>
              <Text style={styles.pricePrefix}>EGP</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="0"
                placeholderTextColor={colors.textPlaceholder}
                value={price}
                onChangeText={(text) => setPrice(sanitizeDecimal(text))}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
            </View>
          </View>
        )}

        {postType === 'Event' && (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Date & time</Text>
              <Pressable style={styles.selectField} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
                <Text style={styles.selectFieldText}>{eventDate.toLocaleString()}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={eventDate}
                  mode="datetime"
                  onChange={(_event, date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (date) setEventDate(date);
                  }}
                />
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Venue or address"
                placeholderTextColor={colors.textPlaceholder}
                value={location}
                onChangeText={setLocation}
              />
            </View>

            <View style={styles.numberRow}>
              <View style={styles.numberField}>
                <Text style={styles.fieldLabel}>
                  Ticket price<Text style={styles.fieldOptional}> (opt.)</Text>
                </Text>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.pricePrefix}>EGP</Text>
                  <TextInput
                    style={styles.priceInput}
                    placeholder="Free"
                    placeholderTextColor={colors.textPlaceholder}
                    value={price}
                    onChangeText={(text) => setPrice(sanitizeDecimal(text))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                  />
                </View>
              </View>
              <View style={styles.numberField}>
                <Text style={styles.fieldLabel}>
                  Capacity<Text style={styles.fieldOptional}> (opt.)</Text>
                </Text>
                <View style={styles.priceInputContainer}>
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={colors.textMuted}
                    style={styles.numberInputIcon}
                  />
                  <TextInput
                    style={styles.priceInput}
                    placeholder="20"
                    placeholderTextColor={colors.textPlaceholder}
                    value={maxAttendees}
                    onChangeText={(text) => setMaxAttendees(sanitizeInteger(text))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                  />
                </View>
              </View>
            </View>
          </>
        )}

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            Photo{postType === 'Marketplace' ? ' *' : ''}
            {postType !== 'Marketplace' && <Text style={styles.fieldOptional}> (optional)</Text>}
          </Text>
          <View style={styles.imagePickerRow}>
            <Pressable style={styles.imagePickerButton} onPress={handlePickImage}>
              <Ionicons name="camera-outline" size={18} color={colors.textTertiary} />
              <Text style={styles.imagePickerText}>Add photo</Text>
            </Pressable>
            {imageUri && (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                <Pressable style={styles.imagePreviewRemove} onPress={() => setImageUri(null)}>
                  <Ionicons name="close" size={12} color={colors.white} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.tagsContainer}>
          <Text style={styles.fieldLabel}>Tags</Text>
          <View style={styles.tagsRow}>
            {COMMUNITY_TAGS.map((tag) => {
              const isActive = selectedTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.tagChip, isActive && styles.tagChipActive]}
                  onPress={() => handleToggleTag(tag)}
                >
                  <Text style={[styles.tagChipText, isActive && styles.tagChipTextActive]}>
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
