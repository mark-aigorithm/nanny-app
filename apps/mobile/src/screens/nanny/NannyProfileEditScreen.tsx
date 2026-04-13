import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { styles } from './styles/nanny-profile-edit-screen.styles';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

const AGE_RANGE_OPTIONS = ['0-1', '1-3', '3-5', '5+'];

export default function NannyProfileEditScreen() {
  const router = useRouter();
  const profile = useUserProfileStore((s) => s.profile);

  const [name, setName] = useState(profile ? `${profile.firstName} ${profile.lastName}` : '');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [experience, setExperience] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const [selectedAgeRange, setSelectedAgeRange] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(`${profile.firstName} ${profile.lastName}`);
  }, [profile]);

  const handleRemoveCert = (cert: string) => {
    setCertifications((prev) => prev.filter((c) => c !== cert));
  };

  const handleSave = () => {
    // TODO: Wire up useUpdateNannyProfile mutation
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo */}
        <View style={styles.photoSection}>
          <Pressable style={styles.photoWrapper}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photo, { backgroundColor: colors.taupe, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="person" size={40} color={colors.textPlaceholder} />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </Pressable>
          <Pressable>
            <Text style={styles.changePhotoText}>Change photo</Text>
          </Pressable>
        </View>

        {/* Basic Info */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Basic information</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={styles.textArea}
              value={bio}
              onChangeText={setBio}
              multiline
              textAlignVertical="top"
              placeholder="Tell parents about yourself..."
              placeholderTextColor={colors.textPlaceholder}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.input} value={location} onChangeText={setLocation} autoCapitalize="words" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Years of experience</Text>
            <TextInput style={styles.input} value={experience} onChangeText={setExperience} keyboardType="number-pad" />
          </View>
        </View>

        {/* Rates */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Rates</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Hourly rate</Text>
            <View style={styles.rateInputRow}>
              <Text style={styles.ratePrefix}>$</Text>
              <TextInput style={styles.rateInput} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="number-pad" />
              <Text style={styles.rateUnit}>/hr</Text>
            </View>
          </View>
        </View>

        {/* Certifications */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Certifications</Text>
          <View style={styles.certsRow}>
            {certifications.map((cert) => (
              <View key={cert} style={styles.certChip}>
                <Text style={styles.certChipText}>{cert}</Text>
                <Pressable onPress={() => handleRemoveCert(cert)} hitSlop={4}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addCertButton}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.addCertText}>Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Age Range */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Age range</Text>
          <View style={styles.ageChipsRow}>
            {AGE_RANGE_OPTIONS.map((range) => {
              const isSelected = selectedAgeRange === range;
              return (
                <Pressable
                  key={range}
                  style={[styles.ageChip, isSelected && styles.ageChipSelected]}
                  onPress={() => setSelectedAgeRange(range)}
                >
                  <Text style={[styles.ageChipText, isSelected && styles.ageChipTextSelected]}>
                    {range}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Save */}
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>

        {/* Switch to Parent View */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.taupe, marginTop: 0 }]}
          onPress={() => router.replace('/(parent)/home')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
            <Text style={[styles.saveButtonText, { color: colors.primary }]}>Switch to Parent View</Text>
          </View>
        </Pressable>

        {/* Sign out */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.taupe, marginTop: 0 }]}
          onPress={() => router.replace('/(auth)/splash')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="log-out-outline" size={18} color={colors.error} />
            <Text style={[styles.saveButtonText, { color: colors.error }]}>Sign out</Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <View style={styles.iconBtn} />
          <Text style={styles.headerTitle}>Edit profile</Text>
          <Pressable style={styles.iconBtn} onPress={handleSave}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
