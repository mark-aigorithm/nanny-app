import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '@mobile/theme';
import { MOCK_PAYMENT_METHODS } from '@mobile/mocks';
import { PAYMENT_TYPES } from '@mobile/constants';
import type { PaymentMethod } from '@mobile/types';
import { styles } from './styles/payment-methods-screen.styles';

function getCardIconName(type: PaymentMethod['type']): string {
  switch (type) {
    case 'apple_pay': return 'logo-apple';
    case 'google_pay': return 'logo-google';
    default: return 'card';
  }
}

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const [cards, setCards] = useState(MOCK_PAYMENT_METHODS);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleSetDefault = (id: string) => {
    setCards((prev) =>
      prev.map((c) => ({ ...c, isDefault: c.id === id })),
    );
  };

  const handleDelete = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Saved Cards */}
        <View style={styles.cardList}>
          {cards.map((card) => (
            <View key={card.id} style={styles.cardItem}>
              <View style={styles.cardIconCircle}>
                <Ionicons name={getCardIconName(card.type) as never} size={22} color={colors.textTertiary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardLabel}>
                  {PAYMENT_TYPES[card.type]}{card.last4 ? ` ****${card.last4}` : ''}
                </Text>
                {card.expiryYear > 0 && (
                  <Text style={styles.cardExpiry}>
                    Expires {String(card.expiryMonth).padStart(2, '0')}/{card.expiryYear}
                  </Text>
                )}
              </View>
              {card.isDefault ? (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                </View>
              ) : (
                <View style={styles.cardActions}>
                  <Pressable onPress={() => handleSetDefault(card.id)}>
                    <Text style={styles.setDefaultText}>Set default</Text>
                  </Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => handleDelete(card.id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Add Card */}
        <Pressable style={styles.addCardButton} onPress={() => setShowAddForm(!showAddForm)}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addCardText}>Add new card</Text>
        </Pressable>

        {/* New Card Form */}
        {showAddForm && (
          <View style={styles.newCardForm}>
            <Text style={styles.formTitle}>New card</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Cardholder name</Text>
              <TextInput style={styles.input} placeholder="Name on card" placeholderTextColor={colors.textPlaceholder} autoCapitalize="words" />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Card number</Text>
              <TextInput style={styles.input} placeholder="1234 5678 9012 3456" placeholderTextColor={colors.textPlaceholder} keyboardType="number-pad" />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.fieldGroup, styles.formFieldHalf]}>
                <Text style={styles.fieldLabel}>Expiry</Text>
                <TextInput style={styles.input} placeholder="MM/YY" placeholderTextColor={colors.textPlaceholder} keyboardType="number-pad" />
              </View>
              <View style={[styles.fieldGroup, styles.formFieldHalf]}>
                <Text style={styles.fieldLabel}>CVV</Text>
                <TextInput style={styles.input} placeholder="123" placeholderTextColor={colors.textPlaceholder} keyboardType="number-pad" secureTextEntry />
              </View>
            </View>
            <Pressable style={styles.saveCardButton}>
              <Text style={styles.saveCardButtonText}>Save card</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Payment methods</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </View>
  );
}
