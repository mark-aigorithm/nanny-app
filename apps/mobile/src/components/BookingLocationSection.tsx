import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatAddressArea, type AddressInput } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import AddressFormSheet from '@mobile/components/AddressFormSheet';
import { defaultAddressOf, useAddresses, useCreateAddress } from '@mobile/hooks/useAddresses';
import { getApiErrorMessage } from '@mobile/lib/api';
import { styles } from './styles/booking-location-section.styles';

type Props = {
  /** The address the booking will be made at; null until one is chosen. */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

/**
 * "Where" step of the booking flow: the mother picks which of her saved
 * addresses the nanny is sent to. Her default is preselected the moment the
 * list arrives, so the common case is a glance and "Continue"; "Add new" opens
 * the address form and selects what it creates, so a first-time booker is
 * never sent elsewhere to set up an address book.
 */
export default function BookingLocationSection({ selectedId, onSelect }: Props) {
  const { data: addresses } = useAddresses();
  const createAddress = useCreateAddress();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Preselect once the list is known and nothing is chosen yet — or the chosen
  // entry has since been deleted from another screen.
  useEffect(() => {
    if (!addresses) return;
    const stillThere = selectedId !== null && addresses.some((a) => a.id === selectedId);
    if (stillThere) return;
    onSelect(defaultAddressOf(addresses)?.id ?? null);
  }, [addresses, selectedId, onSelect]);

  const openAdd = () => {
    setAddError(null);
    createAddress.reset();
    setAdding(true);
  };

  const handleAdd = (input: AddressInput) => {
    setAddError(null);
    createAddress.mutate(input, {
      onSuccess: (created) => {
        onSelect(created.id);
        setAdding(false);
      },
      onError: (err) =>
        setAddError(getApiErrorMessage(err, 'Could not save this address. Please try again.')),
    });
  };

  // Until the list hydrates we can't tell "no address" from "still loading" —
  // showing the empty prompt then would falsely alarm her. Wait.
  if (!addresses) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Where</Text>

      {addresses.length === 0 ? (
        <Pressable style={styles.emptyCard} onPress={openAdd}>
          <View style={styles.emptyIcon}>
            <Ionicons name="location-outline" size={20} color={colors.primaryDark} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardLabel}>Add your address</Text>
            <Text style={styles.emptySub}>
              Your nanny needs to know where to go before you can book.
            </Text>
          </View>
          <Text style={styles.changeLink}>Add</Text>
        </Pressable>
      ) : (
        <View style={styles.list}>
          {addresses.map((address) => {
            const selected = address.id === selectedId;
            return (
              <Pressable
                key={address.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => onSelect(address.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{address.label}</Text>
                  <Text style={styles.cardAddress} numberOfLines={2}>
                    {address.formattedAddress}
                  </Text>
                  <Text style={styles.cardLabel}>{formatAddressArea(address)}</Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable style={styles.addRow} onPress={openAdd}>
            <Ionicons name="add-circle-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.changeLink}>Add new</Text>
          </Pressable>
        </View>
      )}

      <AddressFormSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSubmit={handleAdd}
        submitting={createAddress.isPending}
        error={addError}
      />
    </View>
  );
}
