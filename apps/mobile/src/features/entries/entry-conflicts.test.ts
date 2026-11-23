import type { Entry } from '@split-pay/shared';
import { describe, expect, it } from 'vitest';
import { entryConflicts } from './entry-conflicts';

const current = { id: 'e1', version: 3 } as Entry;

describe('entryConflicts', () => {
  it('remembers the rejected change per group and entry until it is resolved', () => {
    const seen: number[] = [];
    const unsubscribe = entryConflicts.subscribe(() => seen.push(1));

    entryConflicts.mark('g1', { entryId: 'e1', change: 'edit', current });
    expect(entryConflicts.get('g1', 'e1')).toEqual({ entryId: 'e1', change: 'edit', current });
    expect(entryConflicts.get('g2', 'e1')).toBeUndefined();
    expect(entryConflicts.forGroup('g1').has('e1')).toBe(true);

    entryConflicts.resolve('g1', 'e1');
    expect(entryConflicts.get('g1', 'e1')).toBeUndefined();
    expect(entryConflicts.forGroup('g1').size).toBe(0);
    expect(seen).toHaveLength(2);
    unsubscribe();
  });

  it('keeps the same map between changes (stable snapshot for React)', () => {
    expect(entryConflicts.forGroup('g3')).toBe(entryConflicts.forGroup('g3'));
  });
});
