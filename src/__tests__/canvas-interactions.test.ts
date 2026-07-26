import { describe, it, expect } from 'vitest';
import { getExitDirection } from '../utils/routing';
import { Point } from '../core/types';

describe('getExitDirection', () => {
  const src: Point = { x: 100, y: 100 };

  it('returns right when mouse is clearly to the right', () => {
    expect(getExitDirection(src, { x: 200, y: 105 })).toBe('right');
  });

  it('returns left when mouse is clearly to the left', () => {
    expect(getExitDirection(src, { x: 0, y: 105 })).toBe('left');
  });

  it('returns down when mouse is clearly below', () => {
    expect(getExitDirection(src, { x: 105, y: 200 })).toBe('down');
  });

  it('returns up when mouse is clearly above', () => {
    expect(getExitDirection(src, { x: 105, y: 0 })).toBe('up');
  });

  it('prefers horizontal when dx > dy (diagonal)', () => {
    expect(getExitDirection(src, { x: 150, y: 130 })).toBe('right');
  });

  it('prefers vertical when dy > dx (diagonal)', () => {
    expect(getExitDirection(src, { x: 130, y: 150 })).toBe('down');
  });
});
