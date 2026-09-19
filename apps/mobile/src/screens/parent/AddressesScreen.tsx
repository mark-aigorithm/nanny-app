import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatAddressArea, type Address, type AddressInput } from '@nanny-app/shared';

import AddressFormSheet from '@mobile/components/AddressFormSheet';
import { Button, ScreenContainer, StackHeader } from '@mobile/components/ui';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from '@mobile/hooks/useAddresses';
import { getApiErrorMessage } from '@mobile/lib/api';
import { getProfileReturnHref } from '@mobile/lib/profileUtils';
import { colors } from '@mobile/theme';
import { styles } from './styles/addresses-screen.styles';

/** What the sheet is open for: adding, or editing one address. */
type SheetState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; address: Address };

/**
 * The mother's address book. Each entry is where a nanny can be sent; the
 * default is what the booking picker preselects. Edits never move a booking
 * already made — those keep their own snapshot.
 */
export default function AddressesScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { data: addresses, isLoading, isError, refetch } = useAddresses();
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const setDefault = useSetDefaultAddress();
  const deleteAddress = useDeleteAddress();

  const [sheet, setSheet] = useState<SheetState>({ mode: 'closed' });
  const [sheetError, setSheetError] = useState<string | null>(null);

  const handleBack = () => router.replace(getProfileReturnHref(returnTo) as never);

  const openAdd = () => {
    setSheetError(null);
    setSheet({ mode: 'add' });
  };
  const openEdit = (address: Address) => {
    setSheetError(null);
    setSheet({ mode: 'edit', address });
  };
  const closeSheet = () => setSheet({ mode: 'closed' });

  const handleSubmit = (input: AddressInput) => {
    setSheetError(null);
    const onError = (err: unknown) =>
      setSheetError(getApiErrorMessage(err, 'Could not save this address. Please try again.'));
    if (sheet.mode === 'edit') {
      updateAddress.mutate({ id: sheet.address.id, patch: input }, { onSuccess: closeSheet, onError });
    } else {
      createAddress.mutate(input, { onSuccess: closeSheet, onError });
    }
  };

  const confirmDelete = (address: Address) => {
    Alert.alert(
      `Delete ${address.label}?`,
      'Bookings you already made there are not affected.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAddress.mutate(address.id),
        },
      ],
    );
  };

  const submitting = createAddress.isPending || updateAddress.isPending;

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader title="Addresses" subtitle="Where your nanny comes to" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View>
            <Text style={styles.errorText}>Could not load your addresses.</Text>
            <Button title="Try again" variant="outline" onPress={() => void refetch()} />
          </View>
        ) : addresses && addresses.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="location-outline" size={26} color={colors.primaryDark} />
            </View>
            <Text style={styles.emptyTitle}>No addresses yet</Text>
            <Text style={styles.emptySub}>
              Add where your nanny should come — home, work, or grandma&apos;s.
            </Text>
          </View>
        ) : (
          addresses?.map((address) => (
            <View key={address.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="location-outline" size={18} color={colors.primaryDark} />
                <Text style={styles.cardTitle}>{address.label}</Text>
                {address.isDefault && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardLine}>{address.formattedAddress}</Text>
              <Text style={styles.cardMeta}>{formatAddressArea(address)}</Text>
              {address.landmark ? (
                <Text style={styles.cardLandmark}>{address.landmark}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable onPress={() => openEdit(address)} hitSlop={8}>
                  <Text style={styles.action}>Edit</Text>
                </Pressable>
                {!address.isDefault && (
                  <Pressable
                    onPress={() => setDefault.mutate(address.id)}
                    disabled={setDefault.isPending}
                    hitSlop={8}
                  >
                    <Text style={styles.action}>Make default</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => confirmDelete(address)}
                  disabled={deleteAddress.isPending}
                  hitSlop={8}
                >
                  <Text style={styles.actionDestructive}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {!isLoading && !isError && (
          <Button title="Add address" icon="add" onPress={openAdd} variant="secondary" />
        )}
      </ScrollView>

      <AddressFormSheet
        visible={sheet.mode !== 'closed'}
        onClose={closeSheet}
        initial={sheet.mode === 'edit' ? sheet.address : undefined}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={sheetError}
      />
    </ScreenContainer>
  );
}
