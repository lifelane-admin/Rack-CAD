import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  function Group(this: any) {
    this.name = '';
    this.children = [] as any[];
    this.position = { set: vi.fn() };
    this.add = function(child: any) { this.children.push(child); };
  }
  function Mesh(this: any, geo: any, mat: any) {
    this.geometry = geo;
    this.material = mat;
    this.position = { set: vi.fn() };
  }
  const BoxGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number, d: number) {
    this.parameters = { width: w, height: h, depth: d };
    this.clone = vi.fn().mockReturnThis();
    this.dispose = vi.fn();
  });
  function MeshStandardMaterial(this: any, p: any) {
    Object.assign(this, p);
    this.dispose = vi.fn();
    this.isMaterial = true;
  }
  const BackSide = 1;
  return { Group, Mesh, BoxGeometry, MeshStandardMaterial, BackSide };
});

vi.mock('../../three/MaterialManager', () => {
  function MaterialManager(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
  }
  return { MaterialManager };
});

import { buildRackGroup } from '../../three/rack-builder';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RU_HEIGHT, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;

describe('buildRackGroup', () => {
  let materials: MaterialManager;

  beforeEach(() => {
    materials = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns a Group with the correct name', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 } as any;
    const group = buildRackGroup(rack, materials);
    expect(group.name).toBe('rack-r1');
  });

  it('sets group position based on rack x/y', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 300, y: 100 } as any;
    const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const group = buildRackGroup(rack, materials);
    expect(group.position.set).toHaveBeenCalledWith(
      rack.x + RACK_OUTER_WIDTH / 2,
      totalH / 2,
      0
    );
  });

  it('adds children (posts, plates, rails, bay) to the group', () => {
    const rack = { id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    // 4 posts + top plate + bottom plate + left rail + right rail + bay = 9 children minimum
    expect(group.children.length).toBeGreaterThanOrEqual(9);
  });

  it('uses 42 rack units when constructing total height geometry', async () => {
    const { BoxGeometry } = await import('three');
    const rack = { id: 'r2', name: 'Rack 2', units: 42, x: 0, y: 0 } as any;
    buildRackGroup(rack, materials);
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const calls = vi.mocked(BoxGeometry).mock.calls;
    // At least one geometry should use totalH as its height param
    const found = calls.some(([, h]) => h === totalH);
    expect(found).toBe(true);
  });
});
