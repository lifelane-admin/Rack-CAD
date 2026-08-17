import { describe, it, expect } from 'vitest';
import { reorderById } from '../utils/z-order';

describe('reorderById', () => {
  const items = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('"front" moves the item to the end of the array (rendered last = on top)', () => {
    expect(reorderById(items(), 'b', 'front').map(i => i.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('"back" moves the item to the start of the array (rendered first = behind everything)', () => {
    expect(reorderById(items(), 'c', 'back').map(i => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('"forward" swaps the item one position later', () => {
    expect(reorderById(items(), 'b', 'forward').map(i => i.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('"backward" swaps the item one position earlier', () => {
    expect(reorderById(items(), 'c', 'backward').map(i => i.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('"forward" on the last item is a no-op (already at the front)', () => {
    expect(reorderById(items(), 'd', 'forward').map(i => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('"backward" on the first item is a no-op (already at the back)', () => {
    expect(reorderById(items(), 'a', 'backward').map(i => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('"front" on the item already at the front is a no-op', () => {
    expect(reorderById(items(), 'd', 'front').map(i => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('an unknown id returns the array unchanged', () => {
    const original = items();
    expect(reorderById(original, 'zzz', 'front')).toBe(original);
  });

  it('does not mutate the input array', () => {
    const original = items();
    const snapshot = original.map(i => i.id);
    reorderById(original, 'b', 'front');
    expect(original.map(i => i.id)).toEqual(snapshot);
  });
});
