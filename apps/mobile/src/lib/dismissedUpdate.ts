import AsyncStorage from '@react-native-async-storage/async-storage';

// The newest optional version the user chose "Later" for. The prompt comes
// back only when a newer version is released; a mandatory update ignores it.
const KEY = 'dismissed-update-version';

export async function readDismissedUpdate(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function writeDismissedUpdate(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, version);
  } catch {
    // Best effort — worst case the prompt shows again next launch.
  }
}
