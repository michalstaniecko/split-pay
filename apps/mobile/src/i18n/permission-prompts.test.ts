import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// System permission prompts are translated like the rest of the UI
// (docs/SPEC.md → Language), through `locales` in app.json.
const appDir = new URL('../../', import.meta.url);
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, appDir), 'utf8'));
const { expo } = readJson('app.json');

// Face ID: expo-secure-store adds the prompt even though the app doesn't use biometrics yet.
const PROMPTS = ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSFaceIDUsageDescription'];

describe('iOS permission prompts', () => {
  it.each(['pl', 'en'])('are translated to %s', (lang) => {
    const ios = readJson(expo.locales[lang]).ios;
    for (const key of PROMPTS) expect(ios[key], key).toMatch(/\S/);
  });

  it('differ between Polish and English', () => {
    const pl = readJson(expo.locales.pl).ios;
    const en = readJson(expo.locales.en).ios;
    for (const key of PROMPTS) expect(pl[key], key).not.toBe(en[key]);
  });

  it('let iOS pick the language even though the app has no native localisations', () => {
    expect(expo.ios.infoPlist.CFBundleAllowMixedLocalizations).toBe(true);
  });
});
