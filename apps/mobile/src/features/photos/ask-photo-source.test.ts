import { beforeEach, describe, expect, it, vi } from 'vitest';

// The platform pickers are the system boundary: stubbed so the test can
// press an option and see which photo source the user chose.
const native = vi.hoisted(() => ({
  platform: { OS: 'ios' as string },
  showActionSheetWithOptions: vi.fn(),
  alert: vi.fn(),
}));
vi.mock('react-native', () => ({
  Platform: native.platform,
  ActionSheetIOS: { showActionSheetWithOptions: native.showActionSheetWithOptions },
  Alert: { alert: native.alert },
}));

const { askPhotoSource } = await import('./ask-photo-source');

const labels = { title: 'Zdjęcie paragonu', camera: 'Zrób zdjęcie', library: 'Z galerii', cancel: 'Anuluj' };

type SheetOptions = { options: string[]; cancelButtonIndex: number; title?: string };
type AlertButton = { text: string; style?: string; onPress?: () => void };

beforeEach(() => {
  native.showActionSheetWithOptions.mockReset();
  native.alert.mockReset();
});

describe('askPhotoSource', () => {
  it('offers camera, gallery and cancel in the iOS action sheet', async () => {
    native.platform.OS = 'ios';
    native.showActionSheetWithOptions.mockImplementation((options: SheetOptions, callback: (i: number) => void) => {
      expect(options.options).toEqual(['Zrób zdjęcie', 'Z galerii', 'Anuluj']);
      expect(options.cancelButtonIndex).toBe(2);
      callback(0);
    });
    await expect(askPhotoSource(labels)).resolves.toBe('camera');
  });

  it('resolves the gallery, or nothing on cancel, from the iOS action sheet', async () => {
    native.platform.OS = 'ios';
    native.showActionSheetWithOptions.mockImplementationOnce((_: SheetOptions, callback: (i: number) => void) =>
      callback(1),
    );
    await expect(askPhotoSource(labels)).resolves.toBe('library');
    native.showActionSheetWithOptions.mockImplementationOnce((_: SheetOptions, callback: (i: number) => void) =>
      callback(2),
    );
    await expect(askPhotoSource(labels)).resolves.toBeNull();
  });

  it('offers the same choice as alert buttons on Android', async () => {
    native.platform.OS = 'android';
    native.alert.mockImplementation((title: string, _message: unknown, buttons: AlertButton[]) => {
      expect(title).toBe('Zdjęcie paragonu');
      expect(buttons.map((b) => b.text)).toEqual(['Zrób zdjęcie', 'Z galerii', 'Anuluj']);
      buttons[1]?.onPress?.();
    });
    await expect(askPhotoSource(labels)).resolves.toBe('library');
  });

  it('resolves nothing when the Android dialog is cancelled', async () => {
    native.platform.OS = 'android';
    native.alert.mockImplementation((_t: string, _m: unknown, buttons: AlertButton[]) => buttons[2]?.onPress?.());
    await expect(askPhotoSource(labels)).resolves.toBeNull();
    native.alert.mockImplementation((_t: string, _m: unknown, _b: AlertButton[], options: { onDismiss?: () => void }) =>
      options.onDismiss?.(),
    );
    await expect(askPhotoSource(labels)).resolves.toBeNull();
  });

  it('goes straight to the gallery on the web', async () => {
    native.platform.OS = 'web';
    await expect(askPhotoSource(labels)).resolves.toBe('library');
    expect(native.alert).not.toHaveBeenCalled();
    expect(native.showActionSheetWithOptions).not.toHaveBeenCalled();
  });
});
