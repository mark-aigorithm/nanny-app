import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/**
 * Prompt the user to pick a single image from their photo library and return
 * its local URI (or null if they cancel / deny permission). Shared by every
 * ID-capture surface (registration, the forced re-upload screen, the mother
 * booking-gate modal) so the permission + picker flow stays identical.
 */
export async function pickImageFromLibrary(): Promise<string | null> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access to upload your ID.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      return result.assets[0].uri;
    }
    return null;
  } catch (err) {
    Alert.alert(
      'Could not open photos',
      err instanceof Error ? err.message : 'Something went wrong.',
    );
    return null;
  }
}
