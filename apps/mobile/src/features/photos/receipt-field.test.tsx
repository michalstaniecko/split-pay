import { I18nProvider } from '@lingui/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n/i18n';
import { render } from '@/test/native-stub';
import type { ReceiptDraft } from './photo-draft';

vi.mock('react-native', async () => (await import('@/test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('@/test/native-stub')).unistyles);
vi.mock('@/components/icon', async () => (await import('@/test/native-stub')).icon);
vi.mock('expo-image', () => ({ Image: () => <img alt="" /> }));
vi.mock('./pick-photo', () => ({ pickPhoto: vi.fn() }));
vi.mock('./ask-photo-source', () => ({ askPhotoSource: vi.fn() }));

const { ReceiptField } = await import('./receipt-field');

function renderField(draft: ReceiptDraft) {
  i18n.activate('pl');
  return render(
    <I18nProvider i18n={i18n}>
      <ReceiptField draft={draft} storedUrl={undefined} problem={null} onChange={() => {}} />
    </I18nProvider>,
  );
}

const photo = { uri: 'file:///receipt.jpg', size: 1000, width: 1200, height: 1600 };

describe('ReceiptField', () => {
  it('with no photo, offers a single "Dodaj zdjęcie" button', () => {
    const html = renderField({ kind: 'none' });
    expect(html).toContain('Dodaj zdjęcie');
    expect(html).not.toContain('Z galerii');
  });

  it('with a photo, offers removing it or one "Zmień zdjęcie" that asks for the source', () => {
    const html = renderField({ kind: 'local', photo });
    expect(html).toContain('Usuń zdjęcie');
    expect(html).toContain('Zmień zdjęcie');
    expect(html).not.toContain('Zrób nowe');
    expect(html).not.toContain('Z galerii');
    expect(html).not.toContain('Dodaj zdjęcie');
  });
});
