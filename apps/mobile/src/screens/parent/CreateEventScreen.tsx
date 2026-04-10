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
import { styles } from './styles/create-event-screen.styles';

// ─── Screen-specific config ─────────────────────────────────────────────────

type AgeRange = '0-1' | '1-3' | '3-5' | '5+';

const AGE_RANGES: AgeRange[] = ['0-1', '1-3', '3-5', '5+'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateEventScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAgeRange, setSelectedAgeRange] = useState<AgeRange | null>(null);
  const [capacity, setCapacity] = useState(10);

  const canPublish = title.trim().length > 0 && date.trim().length > 0;

  const handleIncrement = () => setCapacity((prev) => prev + 1);
  const handleDecrement = () => setCapacity((prev) => Math.max(1, prev - 1));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color={colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Create event</Text>
        <Pressable
          style={styles.publishHeaderButton}
          onPress={() => router.back()}
          disabled={!canPublish}
        >
          <Text style={styles.publishHeaderButtonText}>Publish</Text>
        </Pressable>
      </View>

      {/* Scrollable form */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Image placeholder */}
        <Pressable style={styles.imagePlaceholder}>
          <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
          <Text style={styles.imagePlaceholderText}>Add event cover photo</Text>
        </Pressable>

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Event name"
            placeholderTextColor={colors.textPlaceholder}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        {/* Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Date</Text>
          <Pressable style={styles.fieldInputWithIcon}>
            <Ionicons name="calendar-outline" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.fieldInputIconText}
              placeholder="Select date"
              placeholderTextColor={colors.textPlaceholder}
              value={date}
              onChangeText={setDate}
            />
          </Pressable>
        </View>

        {/* Time */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Time</Text>
          <Pressable style={styles.fieldInputWithIcon}>
            <Ionicons name="time-outline" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.fieldInputIconText}
              placeholder="Select time"
              placeholderTextColor={colors.textPlaceholder}
              value={time}
              onChangeText={setTime}
            />
          </Pressable>
        </View>

        {/* Location */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Location</Text>
          <Pressable style={styles.fieldInputWithIcon}>
            <Ionicons name="location-outline" size={18} color={colors.textTertiary} />
            <TextInput
              style={styles.fieldInputIconText}
              placeholder="Add location"
              placeholderTextColor={colors.textPlaceholder}
              value={location}
              onChangeText={setLocation}
            />
          </Pressable>
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Tell parents what this event is about..."
            placeholderTextColor={colors.textPlaceholder}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Age range */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Age range</Text>
          <View style={styles.ageRangeRow}>
            {AGE_RANGES.map((range) => {
              const isActive = range === selectedAgeRange;
              return (
                <Pressable
                  key={range}
                  style={[styles.ageChip, isActive && styles.ageChipActive]}
                  onPress={() => setSelectedAgeRange(range)}
                >
                  <Text
                    style={[
                      styles.ageChipText,
                      isActive && styles.ageChipTextActive,
                    ]}
                  >
                    {range} yrs
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Capacity */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Capacity</Text>
          <View style={styles.capacityRow}>
            <Pressable style={styles.capacityButton} onPress={handleDecrement}>
              <Ionicons name="remove" size={20} color={colors.textTertiary} />
            </Pressable>
            <Text style={styles.capacityValue}>{capacity}</Text>
            <Pressable style={styles.capacityButton} onPress={handleIncrement}>
              <Ionicons name="add" size={20} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>

        {/* Publish button */}
        <Pressable
          style={styles.publishButton}
          onPress={() => router.back()}
          disabled={!canPublish}
        >
          <Text style={styles.publishButtonText}>Publish</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
