import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('three', () => ({
  PerspectiveCamera: vi.fn().mockImplementation(function(this: any) {
    this.aspect = 1;
    this.fov = 60;
    this.near = 0.1;
    this.far = 100000;
    this.updateProjectionMatrix = vi.fn();
    this.position = {
      x: 0, y: 0, z: 0,
      set: vi.fn().mockImplementation(function(this: any, x: number, y: number, z: number) {
        this.x = x; this.y = y; this.z = z;
      }),
      clone: vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
    };
    this.lookAt = vi.fn();
  }),
  Vector3: vi.fn().mockImplementation(function(this: any, x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  }),
}));

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: vi.fn().mockImplementation(function(this: any) {
    this.target = { x: 0, y: 0, z: 0, set: vi.fn(), copy: vi.fn() };
    this.update = vi.fn();
    this.dispose = vi.fn();
    this.enableDamping = false;
    this.dampingFactor = 0;
  }),
}));

import { CameraManager } from '../../three/CameraManager';

describe('CameraManager', () => {
  let mgr: CameraManager;
  const mockRenderer = { domElement: document.createElement('canvas') } as any;

  beforeEach(() => {
    vi.useFakeTimers();
    mgr = new CameraManager(mockRenderer);
  });

  afterEach(() => {
    vi.useRealTimers();
    mgr.dispose();
  });

  it('creates camera and controls', () => {
    expect(mgr.camera).toBeDefined();
    expect(mgr.controls).toBeDefined();
  });

  it('setPreset("front") starts a camera animation', () => {
    mgr.setPreset('front');
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });

  it('setPreset accepts all 6 valid preset names', () => {
    const presets = ['front', 'rear', 'left', 'right', 'top', 'perspective'] as const;
    for (const p of presets) {
      expect(() => mgr.setPreset(p)).not.toThrow();
    }
  });

  it('onResize updates camera aspect and calls updateProjectionMatrix', () => {
    mgr.onResize(1920, 1080);
    expect(mgr.camera.aspect).toBeCloseTo(1920 / 1080);
    expect(mgr.camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it('setTarget updates the orbit controls target', () => {
    mgr.setTarget(100, 630, 0);
    expect(mgr.controls.target.set).toHaveBeenCalledWith(100, 630, 0);
  });
});
