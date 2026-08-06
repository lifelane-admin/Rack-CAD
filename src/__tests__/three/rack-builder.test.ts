import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  function Group(this: any) {
    this.name = '';
    this.children = [] as any[];
    this.position = { set: vi.fn() };
    this.add = function(child: any) { this.children.push(child); };
  }
  function Mesh(this: any, geo: any, mat: any) {
    this.geometry = geo; this.material = mat;
    this.position = { set: vi.fn() };
    this.isMesh = true;
  }
  const BoxGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number, d: number) {
    this.parameters = { width: w, height: h, depth: d };
    this.clone = vi.fn().mockReturnThis();
    this.dispose = vi.fn();
  });
  function MeshStandardMaterial(this: any, p: any) {
    Object.assign(this, p); this.dispose = vi.fn(); this.isMaterial = true;
  }
  function Sprite(this: any, mat: any) {
    this.material = mat; this.scale = { set: vi.fn() }; this.position = { set: vi.fn() };
    this.isSprite = true;
  }
  function SpriteMaterial(this: any, p: any) { Object.assign(this, p); this.dispose = vi.fn(); }
  function CanvasTexture(this: any) { this.dispose = vi.fn(); this.repeat = { set: vi.fn() }; this.wrapS = 0; this.wrapT = 0; }
  const BackSide = 1;
  const DoubleSide = 2;
  const RepeatWrapping = 1000;
  const ClampToEdgeWrapping = 1001;
  return { Group, Mesh, BoxGeometry, MeshStandardMaterial, Sprite, SpriteMaterial, CanvasTexture, BackSide, DoubleSide, RepeatWrapping, ClampToEdgeWrapping };
});

vi.mock('../../three/MaterialManager', () => {
  function MaterialManager(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
  }
  return { MaterialManager };
});

vi.mock('../../three/rack-internals', () => {
  return {
    buildRackInternals: vi.fn().mockImplementation(() => {
      const g: any = { name: 'rack-internals', children: [], position: { set: vi.fn() }, add(c: any) { this.children.push(c); } };
      return g;
    }),
  };
});

vi.mock('three/addons/geometries/RoundedBoxGeometry.js', () => {
  const RoundedBoxGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number, d: number) {
    this.parameters = { width: w, height: h, depth: d };
    this.dispose = vi.fn();
  });
  return { RoundedBoxGeometry };
});

import { buildRackGroup } from '../../three/rack-builder';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RU_HEIGHT, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RACK_OUTER_WIDTH } = RACK_CONSTANTS;

describe('buildRackGroup', () => {
  let materials: MaterialManager;

  beforeEach(() => { materials = new MaterialManager(); vi.clearAllMocks(); });

  it('returns a Group with the correct name', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 } as any;
    const group = buildRackGroup(rack, materials);
    expect(group.name).toBe('rack-r1');
  });

  it('sets group position based on rack x', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 } as any;
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const group = buildRackGroup(rack, materials);
    expect(group.position.set).toHaveBeenCalledWith(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
  });

  it('adds base children (posts, plates, rails, bay) — at least 9', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    expect(group.children.length).toBeGreaterThanOrEqual(9);
  });

  it('uses totalH in at least one BoxGeometry', async () => {
    const { BoxGeometry } = await import('three');
    const rack = { id: 'r2', name: 'Rack 2', units: 42, x: 0, y: 0 } as any;
    buildRackGroup(rack, materials);
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const found = vi.mocked(BoxGeometry).mock.calls.some(([, h]) => h === totalH);
    expect(found).toBe(true);
  });

  it('adds exactly rack.units U-number sprites', () => {
    const rack = { id: 'r3', name: 'Rack 3', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    const sprites = group.children.filter((c: any) => c.isSprite);
    expect(sprites).toHaveLength(42);
  });

  it('U-label sprites are scaled consistently', () => {
    const rack = { id: 'r4', name: 'Rack 4', units: 10, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    const sprites = group.children.filter((c: any) => c.isSprite);
    for (const s of sprites) {
      expect((s as any).scale.set).toHaveBeenCalledWith(16, 10, 1);
    }
  });

  it('includes a rack-internals group as a direct child', () => {
    const rack = { id: 'r5', name: 'Rack 5', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    const internals = group.children.find((c: any) => c.name === 'rack-internals');
    expect(internals).toBeDefined();
  });
});
