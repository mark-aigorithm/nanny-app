import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';
import { usePlacesAutocomplete } from '@mobile/hooks/usePlacesAutocomplete';
import { styles } from './styles/location-search-input.styles';

export type LocationSearchCoords = {
  latitude: number;
  longitude: number;
};

type LocationSearchInputProps = {
  /** Current text value (mirrors the registration draft address). */
  value: string;
  onChangeText: (text: string) => void;
  /** Fired when the user picks a suggestion; supplies resolved coords + address. */
  onSelectPlace: (coords: LocationSearchCoords, address: string) => void;
  placeholder?: string;
};

/**
 * Address text field with a Google Places autocomplete dropdown. Typing drives
 * the suggestion list; picking a suggestion resolves it to coordinates and hands
 * both the coords and the formatted address back to the parent. Purely a search
 * affordance — the map pin remains the source of truth for the coordinates.
 */
export default function LocationSearchInput({
  value,
  onChangeText,
  onSelectPlace,
  placeholder = 'Street address',
}: LocationSearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { predictions, selectPlace, clear } = usePlacesAutocomplete(value);

  async function handleSelect(placeId: string) {
    const details = await selectPlace(placeId);
    Keyboard.dismiss();
    setIsFocused(false);
    if (details) {
      onSelectPlace(
        { latitude: details.latitude, longitude: details.longitude },
        details.formattedAddress,
      );
    }
  }

  function handleClear() {
    onChangeText('');
    clear();
    inputRef.current?.focus();
  }

  const showDropdown = isFocused && predictions.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <Ionicons name="location-outline" size={20} color={colors.primary} />
        <TextInput
          ref={inputRef}
          style={styles.inputInner}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          // Delay so a suggestion tap registers before the dropdown unmounts.
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={colors.textPlaceholder}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (predictions[0]) void handleSelect(predictions[0].placeId);
          }}
        />
        {value.length > 0 && (
          <Pressable
            style={styles.clearButton}
            onPress={handleClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear address"
          >
            <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {showDropdown && (
        <View style={styles.dropdown}>
          {predictions.map((prediction, index) => (
            <Pressable
              key={prediction.placeId}
              style={[
                styles.suggestionRow,
                index > 0 && styles.suggestionDivider,
              ]}
              onPress={() => void handleSelect(prediction.placeId)}
            >
              <Ionicons name="location-outline" size={16} color={colors.textTertiary} />
              <Text style={styles.suggestionText} numberOfLines={1}>
                {prediction.description}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
