import * as ImagePicker from 'expo-image-picker';
import { noticeDialog } from '@mobile/store/confirmDialogStore';

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
      noticeDialog({ title: 'Permission needed', message: 'Please allow photo library access to upload your ID.' });
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
    noticeDialog({ title: 'Could not open photos', message: err instanceof Error ? err.message : 'Something went wrong.' });
    return null;
  }
}
