import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Child = {
  name: string;
  age: string;
};

const AGE_OPTIONS = ['<1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12+'];

const PREFERENCE_OPTIONS = [
  'Background checked',
  'CPR certified',
  'Bilingual',
  'Overnight care',
] as const;

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
    router.push('/(auth)/register-step-3' as any);
  }

  function handleAddChild() {
    setChildren((prev) => [...prev, { name: '', age: '' }]);
  }

  function handleChildName(index: number, value: string) {
    setChildren((prev) =>
      prev.map((child, i) => (i === index ? { ...child, name: value } : child))
    );
  }

  function handleChildAge(index: number, value: string) {
    setChildren((prev) =>
      prev.map((child, i) => (i === index ? { ...child, age: value } : child))
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
              <Ionicons name="arrow-back" size={22} color="#1b1c1b" />
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
              <Ionicons name="location-outline" size={20} color="#97a591" />
              <TextInput
                style={styles.iconInputInner}
                value={address}
                onChangeText={setAddress}
                placeholder="Street address"
                placeholderTextColor="#b0a89e"
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
              placeholderTextColor="#b0a89e"
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Map placeholder */}
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapPinContainer}>
                <Ionicons name="location" size={32} color="#97a591" />
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
                  placeholderTextColor="#b0a89e"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <View style={styles.ageDropdown}>
                  <Text style={styles.ageDropdownText}>
                    {child.age !== '' ? child.age + ' yr' : 'Age'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#6b6158" />
                </View>
              </View>
            ))}

            <Pressable style={styles.addChildLink} onPress={handleAddChild}>
              <Ionicons name="add" size={16} color="#97a591" />
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
                  <Pressable
                    key={pref}
                    style={[styles.chip, isSelected ? styles.chipSelected : styles.chipUnselected]}
                    onPress={() => togglePreference(pref)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected ? styles.chipTextSelected : styles.chipTextUnselected,
                      ]}
                    >
                      {pref}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Fixed footer */}
        <View style={styles.footer}>
          <Pressable style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;
const HEADER_CONTENT_HEIGHT = 56;

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },

  // Header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: 16,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: '#fdfaf8',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: '#97a591',
    letterSpacing: -0.5,
  },

  // Mini progress (right side of header)
  miniProgressTrack: {
    width: 96,
    height: 6,
    backgroundColor: '#e3d5ca',
    borderRadius: 3,
  },
  miniProgressFill: {
    width: '66%',
    height: 6,
    backgroundColor: '#97a591',
    borderRadius: 3,
  },

  // Full-width progress bar below header
  progressBarTrack: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 100,
    height: 6,
    backgroundColor: '#e3d5ca',
  },
  progressBarFill: {
    width: '66%',
    height: 6,
    backgroundColor: '#97a591',
    borderRadius: 3,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT + 6 + 24,
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 24,
  },

  // Step label
  stepLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#6b6158',
  },

  // Section title (big headline)
  sectionTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 24,
    color: '#1b1c1b',
    letterSpacing: -0.3,
  },

  // Location group
  locationGroup: {
    gap: 12,
  },

  // Icon input (address)
  iconInputWrapper: {
    height: 56,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  iconInputInner: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Short input (neighbourhood)
  inputShort: {
    height: 44,
    backgroundColor: 'rgba(227,213,202,0.5)',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
  },

  // Map placeholder
  mapPlaceholder: {
    height: 140,
    backgroundColor: '#e5e2e0',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section block
  sectionBlock: {
    gap: 16,
  },
  sectionHeader: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    color: '#1b1c1b',
  },

  // Child card
  childCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  childNameInput: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    color: '#1b1c1b',
    backgroundColor: 'rgba(227,213,202,0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  ageDropdown: {
    width: 96,
    height: 40,
    backgroundColor: 'rgba(227,213,202,0.4)',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ageDropdownText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#6b6158',
  },

  // Add another child link
  addChildLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  addChildLinkText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#97a591',
  },

  // Preference chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#97a591',
  },
  chipUnselected: {
    backgroundColor: '#e3d5ca',
  },
  chipText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  chipTextUnselected: {
    color: '#6b6158',
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    backgroundColor: '#fdfaf8',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e3d5ca',
  },
  continueButton: {
    height: 56,
    borderRadius: 24,
    backgroundColor: '#97a591',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  continueButtonText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    color: '#ffffff',
  },
});
