import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** Take one photo of the delivered goods. Returns a local uri or null if cancelled. */
export async function takePhoto(): Promise<string | null> {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  if (Platform.OS !== 'web') {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) return null;
    const r = await ImagePicker.launchCameraAsync(opts);
    return r.canceled ? null : r.assets[0].uri;
  }
  // Browser preview: a file picker (phones offer the camera from it).
  const r = await ImagePicker.launchImageLibraryAsync(opts);
  return r.canceled ? null : r.assets[0].uri;
}
