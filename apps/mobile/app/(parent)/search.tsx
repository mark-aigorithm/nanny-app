import { View, Text, StyleSheet } from 'react-native';

import { colors, fontSizes } from '@mobile/lib/theme';

export default function SearchScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Search — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  text: { fontSize: fontSizes.base, color: colors.textSecondary },
});
