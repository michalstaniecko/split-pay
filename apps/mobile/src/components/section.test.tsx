import { describe, expect, it, vi } from 'vitest';
import { render } from '../test/native-stub';

vi.mock('react-native', async () => (await import('../test/native-stub')).reactNative);
vi.mock('react-native-unistyles', async () => (await import('../test/native-stub')).unistyles);

const { Section } = await import('./section');

// Fresh light: surface #FFFFFF, radius.lg 24, text #1A1033, sizeMd 16, weightBold 800.
describe('Section', () => {
  it('is a surface card with its title announced as a header', () => {
    const html = render(
      <Section title="Członkowie">
        <span>Ola</span>
      </Section>,
    );
    expect(html).toMatch(/^<div style="[^"]*background-color:#FFFFFF/);
    expect(html).toContain('border-radius:24px');
    expect(html).toContain('padding:16px');
    expect(html).toContain('gap:8px');
    expect(html).toMatch(/<span role="header" style="flex-shrink:1;font-size:16px;font-weight:800;color:#1A1033">Członkowie<\/span>/);
    expect(html).toContain('<span>Ola</span>');
  });

  it('puts a trailing element at the end of the header row', () => {
    const html = render(<Section title="Członkowie" trailing={<span>3 osoby</span>} />);
    expect(html).toMatch(
      /<div style="flex-direction:row;align-items:center;justify-content:space-between;gap:8px"><span role="header"[^>]*>Członkowie<\/span><span>3 osoby<\/span><\/div>/,
    );
  });

  it('does not accept a trailing element without a title', () => {
    // @ts-expect-error — `trailing` lives in the header row, which needs `title`.
    const html = render(<Section trailing={<span>3 osoby</span>} />);
    expect(html).not.toContain('3 osoby');
  });

  it('plain: no card, a small muted header title (inside a sheet)', () => {
    const html = render(<Section variant="plain" title="Kto zapłacił" />);
    expect(html).toMatch(/^<div style="gap:8px;padding-top:8px">/);
    expect(html).not.toContain('background-color');
    expect(html).toMatch(/<span role="header" style="flex-shrink:1;font-size:13px;font-weight:800;color:#6B6385">Kto zapłacił<\/span>/);
  });

  it('without a title has no header row', () => {
    const html = render(
      <Section>
        <span>Ola</span>
      </Section>,
    );
    expect(html).not.toContain('role="header"');
    expect(html).toContain('<span>Ola</span>');
  });
});
