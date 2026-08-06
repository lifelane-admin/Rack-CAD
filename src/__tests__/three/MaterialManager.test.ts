import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Three.js — happy-dom has no WebGL
vi.mock('three', () => {
  function MeshStandardMaterial(this: Record<string, unknown>, params: Record<string, unknown>) {
    Object.assign(this, params);
    this.dispose = vi.fn();
    this.isMaterial = true;
  }
  function Color(this: Record<string, unknown>, c: unknown) {
    this.isColor = true;
    this.value = c;
  }
  function TextureLoader(this: Record<string, unknown>) {
    this.load = vi.fn().mockReturnValue({ isTexture: true, dispose: vi.fn() });
  }
  return { MeshStandardMaterial, Color, TextureLoader };
});

import { MaterialManager } from '../../three/MaterialManager';

describe('MaterialManager', () => {
  let mgr: MaterialManager;

  beforeEach(() => {
    mgr = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns a material for rack-frame type', () => {
    const mat = mgr.get('rack-frame');
    expect(mat).toBeDefined();
    expect(mat.isMaterial).toBe(true);
  });

  it('caches materials — same type returns same instance', () => {
    const a = mgr.get('rack-frame');
    const b = mgr.get('rack-frame');
    expect(a).toBe(b);
  });

  it('caches device materials by hex color', () => {
    const a = mgr.get('device', '#1e88e5');
    const b = mgr.get('device', '#1e88e5');
    const c = mgr.get('device', '#e53935');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('dispose clears all cached materials and calls dispose on each', () => {
    const mat = mgr.get('rack-frame');
    mgr.dispose();
    expect(mat.dispose).toHaveBeenCalledOnce();
    const mat2 = mgr.get('rack-frame');
    expect(mat2).not.toBe(mat);
  });

  it('supports all built-in types', () => {
    for (const type of ['rack-frame', 'rail', 'floor', 'blank-panel']) {
      expect(() => mgr.get(type)).not.toThrow();
    }
  });

  it('getTextured returns a material with a map', () => {
    const mat = mgr.getTextured('data:image/png;base64,abc123');
    expect(mat).toBeDefined();
    expect(mat.isMaterial).toBe(true);
  });

  it('getTextured caches — same dataUrl returns same instance', () => {
    const a = mgr.getTextured('data:image/png;base64,abc123');
    const b = mgr.getTextured('data:image/png;base64,abc123');
    expect(a).toBe(b);
  });

  it('getTextured different dataUrl returns different instance', () => {
    const a = mgr.getTextured('data:image/png;base64,abc123');
    const b = mgr.getTextured('data:image/png;base64,xyz999');
    expect(a).not.toBe(b);
  });

  it('dispose clears textured materials too — re-request gives new instance', () => {
    const mat = mgr.getTextured('data:image/png;base64,abc123');
    mgr.dispose();
    const mat2 = mgr.getTextured('data:image/png;base64,abc123');
    expect(mat2).not.toBe(mat);
  });
});
