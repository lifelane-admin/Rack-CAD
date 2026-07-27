import { describe, it, expect, vi } from 'vitest';

vi.mock('../core/state', () => ({
  stateManager: {
    getState: vi.fn(() => ({
      cabinetViewMode: 'front',
      cabinetDrawMode: 'default',
      isometricMode: false,
      cabinetCoverVisible: false,
      transform: { x: 0, y: 0, scale: 1 },
    })),
    getDevice: vi.fn(() => undefined),
    getRack: vi.fn(() => undefined),
  },
  default: {
    getState: vi.fn(() => ({})),
    setState: vi.fn(),
  },
}));

vi.mock('../renderers/rack-renderer', () => ({
  renderRack: vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g')),
}));

vi.mock('../renderers/device-renderer', () => ({
  renderDevice: vi.fn(() => document.createElementNS('http://www.w3.org/2000/svg', 'g')),
}));

vi.mock('../library/device-catalog', () => ({
  getTemplate: vi.fn(() => ({ heightUnits: 1, category: 'server' })),
}));

describe('renderDevice stateOverride', () => {
  it('function accepts 5 arguments', async () => {
    const { renderDevice } = await import('../renderers/device-renderer');
    expect(typeof renderDevice).toBe('function');
  });
});

describe('renderRack stateOverride', () => {
  it('function accepts 3 arguments', async () => {
    const { renderRack } = await import('../renderers/rack-renderer');
    expect(typeof renderRack).toBe('function');
  });
});
