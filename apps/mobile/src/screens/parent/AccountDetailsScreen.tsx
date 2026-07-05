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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { useSignOut } from '@mobile/hooks/useAuth';
import { useUpdateProfile } from '@mobile/hooks/useMe';
import { isLocalImageUri, uploadImageToFirebase } from '@mobile/lib/storage';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { styles } from './styles/account-details-screen.styles';

export default function AccountDetailsScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const signOut = useSignOut();
  const updateProfile = useUpdateProfile();
  const profile = useUserProfileStore((s) => s.profile);

  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(profile?.avatarUrl ?? null);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setEmail(profile.email);
    setPhone(profile.phone ?? '');
    setPhotoUri(profile.avatarUrl);
  }, [profile]);

  const displayPhotoUri = photoUri ?? profile?.avatarUrl ?? null;

  async function handlePickPhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Please allow photo library access to pick a profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert(
        'Could not open photos',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    }
  }

  const handleBack = () => {
    router.replace({
      pathname: '/(parent)/mother-profile',
      params: { returnTo: returnTo ?? 'home' },
    } as never);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Missing name', 'Please enter your first and last name.');
      return;
    }

    try {
      let avatarUrl: string | null | undefined;
      if (photoUri !== profile?.avatarUrl) {
        if (photoUri && isLocalImageUri(photoUri)) {
          avatarUrl = await uploadImageToFirebase(photoUri, 'avatars');
        } else {
          avatarUrl = photoUri;
        }
      }

      const trimmedPhone = phone.trim();
      const phoneUpdate =
        trimmedPhone !== (profile?.phone ?? '')
          ? trimmedPhone
            ? trimmedPhone
            : null
          : undefined;

      await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(phoneUpdate !== undefined && { phone: phoneUpdate }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      });

      router.replace({
        pathname: '/(parent)/mother-profile',
        params: { returnTo: returnTo ?? 'home' },
      } as never);
    } catch (err) {
      Alert.alert(
        'Could not save profile',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    }
  };

  const handleSignOut = () => {
    signOut.mutate(undefined, {
      onSuccess: () => {
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
        <View style={styles.photoSection}>
          <Pressable style={styles.photoWrapper} onPress={handlePickPhoto}>
            {displayPhotoUri ? (
              <Image
                source={{ uri: displayPhotoUri }}
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
          <Pressable onPress={handlePickPhoto}>
            <Text style={styles.changePhotoText}>Change photo</Text>
          </Pressable>
        </View>

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
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={email}
              editable={false}
              keyboardType="email-address"
              autoCapitalize="none"
            />
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

        <Pressable
          style={[styles.saveButton, updateProfile.isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={updateProfile.isPending}
        >
          <Text style={styles.saveButtonText}>
            {updateProfile.isPending ? 'Saving\u2026' : 'Save changes'}
          </Text>
        </Pressable>

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

      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={handleBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Edit profile</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
