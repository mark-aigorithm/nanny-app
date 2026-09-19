import React, { useState } from 'react';
import { View, Text, Switch } from 'react-native';
import {
  AddressInputSchema,
  type Address,
  type AddressInput,
  type ParsedAddressParts,
} from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { Button, Chip, TextInputField } from '@mobile/components/ui';
import HomeLocationMapCard, { type HomeCoords } from '@mobile/components/HomeLocationMapCard';
import LocationSearchInput from '@mobile/components/LocationSearchInput';
import { reverseGeocodeDetailed } from '@mobile/lib/googlePlaces';
import { styles } from './styles/address-form.styles';

/** The preset labels; anything else is "Other" with a typed name. */
const PRESET_LABELS = ['Home', 'Work'] as const;
const OTHER = 'Other';

type Props = {
  /** Edit mode: prefills every field. Omit to add a new address. */
  initial?: Address;
  onSubmit: (input: AddressInput) => void;
  submitting?: boolean;
  /** A server-side failure to show under the button. */
  error?: string | null;
  submitLabel?: string;
  /** Hide the default toggle (the first address is the default regardless). */
  hideDefaultToggle?: boolean;
};

type Fields = {
  formattedAddress: string;
  governorate: string;
  area: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  landmark: string;
};

const EMPTY: Fields = {
  formattedAddress: '',
  governorate: '',
  area: '',
  street: '',
  building: '',
  floor: '',
  apartment: '',
  landmark: '',
};

function fieldsFrom(initial: Address | undefined): Fields {
  if (!initial) return EMPTY;
  return {
    formattedAddress: initial.formattedAddress,
    governorate: initial.governorate ?? '',
    area: initial.area ?? '',
    street: initial.street ?? '',
    building: initial.building ?? '',
    floor: initial.floor ?? '',
    apartment: initial.apartment ?? '',
    landmark: initial.landmark ?? '',
  };
}

/** Google's parts land in the fields only where it knew something — a pin move never blanks a typed street. */
function mergeParts(fields: Fields, parts: ParsedAddressParts): Fields {
  return {
    ...fields,
    governorate: parts.governorate ?? fields.governorate,
    area: parts.area ?? fields.area,
    street: parts.street ?? fields.street,
  };
}

/**
 * What a mother fills in to add or edit a saved address. Search or pin sets
 * the line and the coordinates and pre-fills the parts Google knows
 * (governorate / area / street, all editable); building, floor, apartment and
 * the landmark are hers to type — Google never knows them. Validated with the
 * shared AddressInputSchema so required/optional cannot drift from the API.
 */
export default function AddressForm({
  initial,
  onSubmit,
  submitting = false,
  error = null,
  submitLabel = 'Save address',
  hideDefaultToggle = false,
}: Props) {
  const initialPreset = initial
    ? (PRESET_LABELS as readonly string[]).includes(initial.label)
      ? initial.label
      : OTHER
    : 'Home';
  const [preset, setPreset] = useState<string>(initialPreset);
  const [customLabel, setCustomLabel] = useState(
    initial && initialPreset === OTHER ? initial.label : '',
  );
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(initial));
  const [coords, setCoords] = useState<HomeCoords | null>(
    initial ? { latitude: initial.latitude, longitude: initial.longitude } : null,
  );
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<string, string>>>({});

  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  // Pin moved: keep the coords, then reverse-geocode to keep the line and the
  // Google-known parts in step. Typed fields survive (see mergeParts).
  const handlePinChange = (next: HomeCoords) => {
    setFieldErrors({});
    setCoords(next);
    void reverseGeocodeDetailed(next).then((geocoded) => {
      if (!geocoded) return;
      setFields((current) => ({
        ...mergeParts(current, geocoded.parts),
        formattedAddress: geocoded.formattedAddress,
      }));
    });
  };

  const handleSubmit = () => {
    const label = preset === OTHER ? customLabel : preset;
    const candidate = {
      label,
      formattedAddress: fields.formattedAddress,
      governorate: fields.governorate,
      area: fields.area,
      street: fields.street,
      building: fields.building,
      floor: fields.floor,
      apartment: fields.apartment,
      landmark: fields.landmark,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      ...(hideDefaultToggle ? {} : { isDefault }),
    };
    const parsed = AddressInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Partial<Record<string, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      // Missing coordinates read as "no address yet" — the one message that
      // tells her what to do rather than naming a field she never sees.
      if (next['latitude'] || next['longitude']) {
        next['formattedAddress'] = next['formattedAddress'] ?? 'Search for or pin the address.';
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    onSubmit(parsed.data);
  };

  return (
    <View style={styles.form}>
      <View>
        <Text style={styles.fieldLabel}>What should we call it?</Text>
        <View style={styles.labelRow}>
          {[...PRESET_LABELS, OTHER].map((option) => (
            <Chip
              key={option}
              label={option}
              active={preset === option}
              onPress={() => {
                setPreset(option);
                setFieldErrors(({ label: _label, ...rest }) => rest);
              }}
            />
          ))}
        </View>
      </View>
      {preset === OTHER && (
        <TextInputField
          placeholder="e.g. Grandma's"
          value={customLabel}
          onChangeText={setCustomLabel}
          autoCapitalize="words"
          error={fieldErrors['label'] ?? null}
        />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Where is it?</Text>
        <Text style={styles.hint}>Search for the address or drag the pin to the door.</Text>
        <LocationSearchInput
          value={fields.formattedAddress}
          onChangeText={set('formattedAddress')}
          onSelectPlace={(place, address, parts) => {
            setFieldErrors({});
            setCoords(place);
            setFields((current) => ({ ...mergeParts(current, parts), formattedAddress: address }));
          }}
          placeholder="Street address"
        />
        <HomeLocationMapCard
          coords={coords}
          onChange={handlePinChange}
          errorText={fieldErrors['formattedAddress'] ?? null}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details for your nanny</Text>
        <View style={styles.row}>
          <TextInputField
            containerStyle={styles.rowField}
            label="Governorate"
            placeholder="Cairo"
            value={fields.governorate}
            onChangeText={set('governorate')}
            error={fieldErrors['governorate'] ?? null}
          />
          <TextInputField
            containerStyle={styles.rowField}
            label="Area"
            placeholder="Maadi"
            value={fields.area}
            onChangeText={set('area')}
            error={fieldErrors['area'] ?? null}
          />
        </View>
        <TextInputField
          label="Street"
          placeholder="Street"
          value={fields.street}
          onChangeText={set('street')}
          error={fieldErrors['street'] ?? null}
        />
        <View style={styles.row}>
          <TextInputField
            containerStyle={styles.rowField}
            placeholder="Building"
            value={fields.building}
            onChangeText={set('building')}
            error={fieldErrors['building'] ?? null}
          />
          <TextInputField
            containerStyle={styles.rowField}
            placeholder="Floor"
            value={fields.floor}
            onChangeText={set('floor')}
            error={fieldErrors['floor'] ?? null}
          />
          <TextInputField
            containerStyle={styles.rowField}
            placeholder="Apt"
            value={fields.apartment}
            onChangeText={set('apartment')}
            error={fieldErrors['apartment'] ?? null}
          />
        </View>
        <TextInputField
          label="Landmark / how to find you"
          placeholder="Behind Seoudi Market, gate 2, ring bell 3"
          value={fields.landmark}
          onChangeText={set('landmark')}
          multiline
          error={fieldErrors['landmark'] ?? null}
        />
      </View>

      {!hideDefaultToggle && (
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Use as my default</Text>
            <Text style={styles.toggleSub}>Picked first when you book.</Text>
          </View>
          <Switch
            value={isDefault}
            onValueChange={setIsDefault}
            trackColor={{ false: colors.taupe, true: colors.primary }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.taupe}
          />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title={submitLabel} onPress={handleSubmit} loading={submitting} disabled={submitting} />
    </View>
  );
}
