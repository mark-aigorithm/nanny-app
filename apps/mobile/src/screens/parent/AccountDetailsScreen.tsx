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
import { useSignOut } from '@mobile/hooks/useAuth';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { styles } from './styles/account-details-screen.styles';

export default function AccountDetailsScreen() {
  const router = useRouter();
  const signOut = useSignOut();
  const profile = useUserProfileStore((s) => s.profile);

  // Bind editable fields to the live backend profile. Address fields are not
  // yet on the User model — they stay as empty inputs until a future migration
  // adds them. Update wiring is intentionally still pending; see handleSave.
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Re-sync the editable fields when the profile loads after this screen
  // mounts (e.g. cold launch or store hydration races).
  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setEmail(profile.email);
    setPhone(profile.phone ?? '');
  }, [profile]);

  const handleSave = () => {
    // Update flow lives in a separate task — see /auth/update-profile when
    // that endpoint exists. For now, just close the screen.
    router.back();
  };

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
        // Root gate at app/index.tsx redirects to /(auth)/splash once the
        // Firebase auth listener nulls out the user; the router push is
        // redundant but unambiguous from a non-index screen.
        router.replace('/');
      },
    });
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
              <Image
                source={{ uri: profile.avatarUrl }}
                style={styles.photo}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}>
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

        {/* Form */}
        <View style={styles.formSection}>
          <View style={styles.formRow}>
            <View style={[styles.fieldGroup, styles.formFieldHalf]}>
              <Text style={styles.fieldLabel}>First name</Text>
              <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            </View>
            <View style={[styles.fieldGroup, styles.formFieldHalf]}>
              <Text style={styles.fieldLabel}>Last name</Text>
              <TextInput style={styles.input} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} autoCapitalize="words" />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.fieldGroup, { flex: 2 }]}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput style={styles.input} value={city} onChangeText={setCity} autoCapitalize="words" />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>State</Text>
              <TextInput style={styles.input} value={state} onChangeText={setState} autoCapitalize="characters" maxLength={2} />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>ZIP</Text>
              <TextInput style={styles.input} value={zipCode} onChangeText={setZipCode} keyboardType="number-pad" maxLength={5} />
            </View>
          </View>
        </View>

        {/* Save */}
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>

        {/* Sign out */}
        <Pressable
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={signOut.isPending}
        >
          <Text style={styles.signOutButtonText}>
            {signOut.isPending ? 'Signing out\u2026' : 'Sign out'}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Account details</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
