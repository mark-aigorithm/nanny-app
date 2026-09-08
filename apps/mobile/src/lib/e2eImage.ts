import { Asset } from 'expo-asset';
import Constants from 'expo-constants';

/**
 * End-to-end affordance for the registration image steps.
 *
 * Step 1 disables Continue until `draft.photoUri` is set, and the nanny ID
 * screens require an upload — both open the Android photo picker + crop screen,
 * which is system UI that changes between OS versions and is the most fragile
 * thing a flow could touch. Under E2E (the Storage-emulator host is set), skip
 * the picker entirely and return a bundled placeholder image's local URI, so
 * the flow gets past the gate and still exercises a real upload to the Storage
 * emulator. Returns `null` in every real build, where the real picker runs.
 *
 * See Docs/testing/2026-09-04-e2e-coverage-expansion-design.md (Phase 2b).
 */
export async function e2ePlaceholderImageUri(): Promise<string | null> {
  const isE2E = Constants.expoConfig?.extra?.['firebaseStorageEmulatorHost'];
  if (!isE2E) return null;
  // Reuse the app icon as a stand-in. `downloadAsync` puts the bundled asset on
  // the filesystem and fills in `localUri`, which matters: uploadImageToFirebase
  // hands the URI straight to the native putFile, and that reads a local path
  // (file:// / content://) — not the http:// URL Metro serves assets from.
  const asset = Asset.fromModule(require('../../assets/icon.png'));
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}
