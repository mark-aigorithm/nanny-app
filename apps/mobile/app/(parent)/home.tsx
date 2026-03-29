import { View, Text, StyleSheet } from 'react-native';

export default function ParentHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Find Nannies — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, color: '#374151' },
});
