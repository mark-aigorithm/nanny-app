import React, { useState } from 'react';
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
import { MOCK_ACCOUNT_DETAILS } from '@mobile/mocks';
import { styles } from './styles/account-details-screen.styles';

export default function AccountDetailsScreen() {
  const router = useRouter();

  const [firstName, setFirstName] = useState(MOCK_ACCOUNT_DETAILS.firstName);
  const [lastName, setLastName] = useState(MOCK_ACCOUNT_DETAILS.lastName);
  const [email, setEmail] = useState(MOCK_ACCOUNT_DETAILS.email);
  const [phone, setPhone] = useState(MOCK_ACCOUNT_DETAILS.phone);
  const [address, setAddress] = useState(MOCK_ACCOUNT_DETAILS.address);
  const [city, setCity] = useState(MOCK_ACCOUNT_DETAILS.city);
  const [state, setState] = useState(MOCK_ACCOUNT_DETAILS.state);
  const [zipCode, setZipCode] = useState(MOCK_ACCOUNT_DETAILS.zipCode);

  const handleSave = () => {
    // TODO: Wire up useUpdateProfile mutation
    router.back();
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
            <Image source={{ uri: MOCK_ACCOUNT_DETAILS.photo }} style={styles.photo} resizeMode="cover" />
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
