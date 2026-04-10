import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors } from '@mobile/theme';
import type { Child } from '@mobile/types';
import { PREFERENCE_OPTIONS } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import Chip from '@mobile/components/ui/chip';
import { styles } from './styles/registration-step2-screen.styles';

export default function RegistrationStep2Screen() {
  const router = useRouter();

  const [address, setAddress] = useState('');
  const [neighbourhood, setNeighbourhood] = useState('');
  const [children, setChildren] = useState<Child[]>([{ name: '', age: '' }]);
  const [preferences, setPreferences] = useState<string[]>([
    'Background checked',
    'CPR certified',
  ]);

  function handleBack() {
    router.back();
  }

  function handleContinue() {
    router.push('/(auth)/register-step-3');
  }

  function handleAddChild() {
    setChildren((prev) => [...prev, { name: '', age: '' }]);
  }

  function handleChildName(index: number, value: string) {
    setChildren((prev) =>
      prev.map((child, i) => (i === index ? { ...child, name: value } : child))
    );
  }

  function togglePreference(pref: string) {
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        {/* Fixed header bar */}
        <View style={styles.headerBar}>
          <View style={styles.headerLeft}>
            <Pressable style={styles.backButton} onPress={handleBack} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.brandText}>NannyMom</Text>
          </View>
          <View style={styles.miniProgressTrack}>
            <View style={styles.miniProgressFill} />
          </View>
        </View>

        {/* Full-width progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={styles.progressBarFill} />
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step label */}
          <Text style={styles.stepLabel}>Step 2 of 3 — Location & preferences</Text>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Where are you based?</Text>

          {/* Location inputs */}
          <View style={styles.locationGroup}>
            {/* Street address */}
            <View style={styles.iconInputWrapper}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <TextInput
                style={styles.iconInputInner}
                value={address}
                onChangeText={setAddress}
                placeholder="Street address"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Neighbourhood */}
            <TextInput
              style={styles.inputShort}
              value={neighbourhood}
              onChangeText={setNeighbourhood}
              placeholder="Neighbourhood (optional)"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Map placeholder */}
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapPinContainer}>
                <Ionicons name="location" size={32} color={colors.primary} />
              </View>
            </View>
          </View>

          {/* Your children section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeader}>Your children</Text>

            {children.map((child, index) => (
              <View key={index} style={styles.childCard}>
                <TextInput
                  style={styles.childNameInput}
                  value={child.name}
                  onChangeText={(val) => handleChildName(index, val)}
                  placeholder="Child's name"
                  placeholderTextColor={colors.textPlaceholder}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <View style={styles.ageDropdown}>
                  <Text style={styles.ageDropdownText}>
                    {child.age !== '' ? child.age + ' yr' : 'Age'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </View>
              </View>
            ))}

            <Pressable style={styles.addChildLink} onPress={handleAddChild}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addChildLinkText}>Add another child</Text>
            </Pressable>
          </View>

          {/* What matters most section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionHeader}>What matters most?</Text>
            <View style={styles.chipsWrap}>
              {PREFERENCE_OPTIONS.map((pref) => {
                const isSelected = preferences.includes(pref);
                return (
                  <Chip
                    key={pref}
                    label={pref}
                    active={isSelected}
                    onPress={() => togglePreference(pref)}
                    size="md"
                    style={styles.chip}
                  />
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Button title="Continue" onPress={handleContinue} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

