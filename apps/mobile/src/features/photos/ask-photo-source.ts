import { ActionSheetIOS, Alert, Platform } from 'react-native';
import type { PhotoSource } from './pick-photo';

export type PhotoSourceLabels = { title: string; camera: string; library: string; cancel: string };

/**
 * Asks where a photo should come from ("Zrób zdjęcie" / "Z galerii") with
 * the platform's own picker: the action sheet on iOS, an alert with
 * buttons on Android. The web has no camera flow, so it goes straight to
 * the gallery. Resolves `null` when the user cancels.
 */
export function askPhotoSource(labels: PhotoSourceLabels): Promise<PhotoSource | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  const sources: PhotoSource[] = ['camera', 'library'];
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: labels.title, options: [labels.camera, labels.library, labels.cancel], cancelButtonIndex: 2 },
        (index) => resolve(sources[index] ?? null),
      );
      return;
    }
    Alert.alert(
      labels.title,
      undefined,
      [
        { text: labels.camera, onPress: () => resolve('camera') },
        { text: labels.library, onPress: () => resolve('library') },
        { text: labels.cancel, style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
