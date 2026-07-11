import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SETTINGS_ITEMS } from '@mobile/mocks';
import { Avatar } from '@mobile/components/ui';
import { colors } from '@mobile/theme';
import { styles } from './styles/mother-profile-wallet-screen.styles';
import { useSignOut } from '@mobile/hooks/useAuth';
import { getProfileReturnHref } from '@mobile/lib/profileUtils';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

export default function MotherProfileWalletScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const profile = useUserProfileStore((s) => s.profile);
  const signOut = useSignOut();

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : '';

  const handleBack = () => {
    router.replace(getProfileReturnHref(returnTo) as never);
  };

  const handleSettingsPress = (id: string) => {
    switch (id) {
      case 'payment':
        router.push('/(parent)/payment-methods' as never);
        break;
      case 'help':
        router.push({
          pathname: '/(parent)/customer-support',
          params: {
            returnTo: 'mother-profile',
            profileReturnTo: returnTo ?? 'home',
          },
        } as never);
        break;
      case 'nannies':
        router.push('/(parent)/search');
        break;
      case 'logout':
        signOut.mutate(undefined, {
          onSuccess: () => router.replace('/'),
        });
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <View style={styles.profilePhotoWrap}>
            {profile?.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={styles.profilePhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.profilePhoto, styles.profilePhotoFallback]}>
                <Ionicons name="person" size={40} color={colors.textPlaceholder} />
              </View>
            )}
          </View>

          {displayName ? (
            <Text style={styles.profileName}>{displayName}</Text>
          ) : null}

          {profile?.email ? (
            <View style={styles.locationRow}>
              <Ionicons name="mail-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.locationText}>{profile.email}</Text>
            </View>
          ) : null}

          {profile?.phone ? (
            <View style={styles.locationRow}>
              <Ionicons name="call-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.locationText}>{profile.phone}</Text>
            </View>
          ) : null}

          <Pressable
            style={styles.editProfileBtn}
            onPress={() =>
              router.push({
                pathname: '/(parent)/account-details',
                params: { returnTo: returnTo ?? 'home' },
              } as never)
            }
          >
            <Text style={styles.editProfileText}>View profile</Text>
          </Pressable>
        </View>

        <View style={styles.settingsList}>
          {SETTINGS_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              style={styles.settingsItem}
              onPress={() => handleSettingsPress(item.id)}
              disabled={item.id === 'logout' && signOut.isPending}
            >
              <View style={styles.settingsItemLeft}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.isDestructive ? colors.errorDark : colors.textPrimary}
                />
                <Text
                  style={[
                    styles.settingsItemLabel,
                    item.isDestructive && styles.settingsItemLabelDestructive,
                  ]}
                >
                  {item.id === 'logout' && signOut.isPending ? 'Signing out\u2026' : item.label}
                </Text>
              </View>
              <View style={styles.settingsItemRight}>
                {item.badge != null && (
                  <View style={styles.settingsBadge}>
                    <Text style={styles.settingsBadgeText}>{item.badge}</Text>
                  </View>
                )}
                {!item.isDestructive && (
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                )}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconBtn} onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerAvatarWrap}>
            <Avatar uri={profile?.avatarUrl ?? undefined} size="sm" fallbackInitial={profile?.firstName?.[0]} />
          </View>
        </View>
      </View>
    </View>
  );
}
