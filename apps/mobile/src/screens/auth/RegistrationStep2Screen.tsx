import React from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import type { Child } from '@mobile/types';
import { PREFERENCE_OPTIONS } from '@mobile/constants';
import Button from '@mobile/components/ui/button';
import Chip from '@mobile/components/ui/chip';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { styles } from './styles/registration-step2-screen.styles';

export default function RegistrationStep2Screen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();

  const draft = useRegistrationDraftStore();
  const patch = useRegistrationDraftStore((s) => s.patch);

  function handleBack() {
    router.back();
  }

  function handleContinue() {
    router.push({ pathname: '/(auth)/register-step-3', params: { role } });
  }

  function handleAddChild() {
    patch({ children: [...draft.children, { name: '', age: '' }] });
  }

  function handleChildName(index: number, value: string) {
    const next: Child[] = draft.children.map((child, i) =>
      i === index ? { ...child, name: value } : child,
    );
    patch({ children: next });
  }

  function togglePreference(pref: string) {
    const next = draft.preferences.includes(pref)
      ? draft.preferences.filter((p) => p !== pref)
      : [...draft.preferences, pref];
    patch({ preferences: next });
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
          <Text style={styles.stepLabel}>STEP 3 OF 4 — LOCATION & PREFERENCES</Text>

          {/* Section title */}
          <Text style={styles.sectionTitle}>Where are you based?</Text>

          {/* Location inputs */}
          <View style={styles.locationGroup}>
            {/* Street address */}
            <View style={styles.iconInputWrapper}>
              <Ionicons name="location-outline" size={20} color={colors.primary} />
              <TextInput
                style={styles.iconInputInner}
                value={draft.address}
                onChangeText={(val) => patch({ address: val })}
                placeholder="Street address"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Neighbourhood */}
            <TextInput
              style={styles.inputShort}
              value={draft.neighbourhood}
              onChangeText={(val) => patch({ neighbourhood: val })}
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

            {draft.children.map((child, index) => (
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
                const isSelected = draft.preferences.includes(pref);
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
