import { describe, expect, it, vi } from 'vitest';
import { composerStore } from './composer-store';

describe('composerStore', () => {
  it('keeps one draft per group, empty by default', () => {
    composerStore.set('g1', { amount: '12', title: 'Pizza' });
    expect(composerStore.get('g1')).toEqual({ amount: '12', title: 'Pizza' });
    expect(composerStore.get('g2')).toEqual({ amount: '', title: '' });
  });

  it('clears a draft and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = composerStore.subscribe(listener);
    composerStore.set('g1', { amount: '5', title: 'Kawa' });
    composerStore.clear('g1');
    expect(composerStore.get('g1')).toEqual({ amount: '', title: '' });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    composerStore.set('g1', { amount: '1', title: 'x' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns the same object until the draft changes (useSyncExternalStore needs stable snapshots)', () => {
    composerStore.set('g3', { amount: '1', title: 'a' });
    expect(composerStore.get('g3')).toBe(composerStore.get('g3'));
    expect(composerStore.get('g4')).toBe(composerStore.get('g5'));
  });
});
