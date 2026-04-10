import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { styles } from './styles/create-post-screen.styles';

// ─── Screen-specific config ─────────────────────────────────────────────────

type PostType = 'Q&A' | 'Marketplace' | 'Event';

const POST_TYPES: PostType[] = ['Q&A', 'Marketplace', 'Event'];

const AVAILABLE_TAGS = [
  'Parenting',
  'Sleep',
  'Feeding',
  'Activities',
  'Health',
  'Development',
  'Nanny tips',
  'Local',
] as const;

type Tag = typeof AVAILABLE_TAGS[number];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreatePostScreen() {
  const router = useRouter();
  const [postType, setPostType] = useState<PostType>('Q&A');
  const [body, setBody] = useState('');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);

  const canPost = body.trim().length > 0;

  const handleToggleTag = (tag: Tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handlePickImage = () => {
    // Placeholder: would open image picker
  };

  const handleRemoveImage = () => {
    setImageUri(null);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Create post</Text>
        <Pressable
          style={[styles.postButton, !canPost && styles.postButtonDisabled]}
          disabled={!canPost}
          onPress={() => router.back()}
        >
          <Text style={styles.postButtonText}>Post</Text>
        </Pressable>
      </View>

      {/* Scrollable form */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Post type chips */}
        <View>
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
                  <Text
                    style={[
                      styles.typeChipText,
                      isActive && styles.typeChipTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Text input */}
        <TextInput
          style={styles.textArea}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.textPlaceholder}
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
        />

        {/* Image picker */}
        <View>
          <Text style={styles.sectionLabel}>Add photo</Text>
          <View style={styles.imagePickerRow}>
            <Pressable style={styles.imagePickerButton} onPress={handlePickImage}>
              <Ionicons name="camera-outline" size={20} color={colors.textTertiary} />
              <Text style={styles.imagePickerText}>Choose image</Text>
            </Pressable>
            {imageUri && (
              <View>
                <View style={styles.imagePreview} />
                <Pressable style={styles.imagePreviewRemove} onPress={handleRemoveImage}>
                  <Ionicons name="close" size={12} color={colors.white} />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Tags */}
        <View style={styles.tagsContainer}>
          <Text style={styles.sectionLabel}>Tags</Text>
          <View style={styles.tagsRow}>
            {AVAILABLE_TAGS.map((tag) => {
              const isActive = selectedTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  style={[styles.tagChip, isActive && styles.tagChipActive]}
                  onPress={() => handleToggleTag(tag)}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      isActive && styles.tagChipTextActive,
                    ]}
                  >
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
