import { View, Text, StyleSheet } from 'react-native';

export default function NannyProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Nanny Profile — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, color: '#374151' },
});
