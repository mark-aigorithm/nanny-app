import React from 'react';
import { View } from 'react-native';
import type { AddressPartFields } from '@nanny-app/shared';

import { TextInputField } from '@mobile/components/ui';
import { styles } from './styles/address-parts-fields.styles';

type Props = {
  values: AddressPartFields;
  onChange: (key: keyof AddressPartFields, value: string) => void;
};

/**
 * The registration location step's governorate / area / street / building —
 * pre-filled from the pin or a search, and all hers to correct.
 */
export default function AddressPartsFields({ values, onChange }: Props) {
  return (
    <View style={styles.fields}>
      <View style={styles.row}>
        <TextInputField
          containerStyle={styles.field}
          label="Governorate"
          placeholder="Cairo"
          value={values.governorate}
          onChangeText={(value) => onChange('governorate', value)}
          autoCapitalize="words"
        />
        <TextInputField
          containerStyle={styles.field}
          label="Area"
          placeholder="Maadi"
          value={values.area}
          onChangeText={(value) => onChange('area', value)}
          autoCapitalize="words"
        />
      </View>
      <View style={styles.row}>
        <TextInputField
          containerStyle={styles.wideField}
          label="Street"
          placeholder="Street"
          value={values.street}
          onChangeText={(value) => onChange('street', value)}
          autoCapitalize="words"
        />
        <TextInputField
          containerStyle={styles.field}
          label="Building"
          placeholder="No."
          value={values.building}
          onChangeText={(value) => onChange('building', value)}
        />
      </View>
    </View>
  );
}
