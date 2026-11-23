import { downscaledSize, PHOTO_JPEG_QUALITY } from '@split-pay/shared';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { LocalPhoto } from './photo-draft';

export type PhotoSource = 'camera' | 'library';
export type PickResult = { status: 'picked'; photo: LocalPhoto } | { status: 'canceled' } | { status: 'denied' };

/**
 * Takes (camera) or picks (library) a photo and prepares it for upload:
 * downscaled so the longer side is at most `maxDimension`, re-encoded as
 * a compressed JPEG. Re-encoding writes a new file without the original's
 * EXIF metadata (GPS included) — the original never leaves the phone.
 * `square`: let the user crop to 1:1 (avatars).
 */
export async function pickPhoto(
  source: PhotoSource,
  options: { maxDimension: number; square?: boolean },
): Promise<PickResult> {
  const pickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    exif: false,
    ...(options.square ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}),
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    result = await ImagePicker.launchCameraAsync(pickerOptions);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  }
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'canceled' };
  return { status: 'picked', photo: await preparePhoto(asset.uri, asset, options.maxDimension) };
}

/**
 * Camera first; falls back to the library where there is no camera
 * (simulator, web) or access was refused.
 */
export async function takeOrPickPhoto(options: { maxDimension: number }): Promise<PickResult> {
  try {
    const taken = await pickPhoto('camera', options);
    if (taken.status !== 'denied') return taken;
  } catch {
    // No camera available.
  }
  return pickPhoto('library', options);
}

/** Downscales and re-encodes as JPEG (drops EXIF). */
export async function preparePhoto(
  uri: string,
  size: { width: number; height: number },
  maxDimension: number,
): Promise<LocalPhoto> {
  const context = ImageManipulator.manipulate(uri);
  if (size.width > 0 && size.height > 0) {
    const target = downscaledSize(size, maxDimension);
    if (target.width !== size.width || target.height !== size.height) context.resize(target);
  } else {
    // Unknown dimensions (some web pickers): cap the width.
    context.resize({ width: maxDimension });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_JPEG_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height, size: await fileSize(saved.uri) };
}

async function fileSize(uri: string): Promise<number> {
  if (Platform.OS === 'web') return (await (await fetch(uri)).blob()).size;
  return new File(uri).size;
}
