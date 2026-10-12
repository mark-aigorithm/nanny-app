import * as ImagePicker from 'expo-image-picker';

jest.mock('@mobile/lib/e2eImage', () => ({
  e2ePlaceholderImageUri: jest.fn().mockResolvedValue(null),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchImageLibraryAsync: jest.fn(),
}));

import { pickImageFromLibrary } from '../pickImage';

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;

describe('pickImageFromLibrary', () => {
  // Android's cropper opened over the whole photo and "Crop" returned it
  // unchanged: an ID goes straight back from the library, uncropped.
  it('returns the chosen photo without a crop step', async () => {
    launch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///id.jpg' }] });

    await expect(pickImageFromLibrary()).resolves.toBe('file:///id.jpg');
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: false }));
  });

  it('returns null when the picker is cancelled', async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImageFromLibrary()).resolves.toBeNull();
  });
});
