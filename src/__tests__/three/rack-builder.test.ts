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
  function MeshBasicMaterial(this: any, p: any) {
    Object.assign(this, p); this.dispose = vi.fn(); this.isMaterial = true;
  }
  const RingGeometry = vi.fn().mockImplementation(function(this: any, innerRadius: number, outerRadius: number, segments: number) {
    this.parameters = { innerRadius, outerRadius, segments };
    this.rotateX = vi.fn().mockReturnThis();
    this.dispose = vi.fn();
  });
  function Sprite(this: any, mat: any) {
    this.material = mat; this.scale = { set: vi.fn() }; this.position = { set: vi.fn() };
    this.isSprite = true;
  }
  function SpriteMaterial(this: any, p: any) { Object.assign(this, p); this.dispose = vi.fn(); }
  function CanvasTexture(this: any) { this.dispose = vi.fn(); this.repeat = { set: vi.fn() }; this.wrapS = 0; this.wrapT = 0; }
  function Shape(this: any) {
    this.holes = [] as any[];
    this.moveTo = vi.fn().mockReturnThis();
    this.lineTo = vi.fn().mockReturnThis();
  }
  function Path(this: any) {
    this.moveTo = vi.fn().mockReturnThis();
    this.lineTo = vi.fn().mockReturnThis();
    this.absarc = vi.fn().mockReturnThis();
  }
  const ExtrudeGeometry = vi.fn().mockImplementation(function(this: any, shape: any, options: any) {
    this.parameters = { shapes: shape, options };
    this.rotateX = vi.fn().mockReturnThis();
    this.translate = vi.fn().mockReturnThis();
    this.dispose = vi.fn();
  });
  const PlaneGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number) {
    this.parameters = { width: w, height: h };
    this.clone = vi.fn().mockReturnThis();
    this.dispose = vi.fn();
  });
  function Color(this: any, c: any) { this.value = c; this.set = vi.fn(); }
  const BackSide = 1;
  const DoubleSide = 2;
  const RepeatWrapping = 1000;
  const ClampToEdgeWrapping = 1001;
  const SRGBColorSpace = 'srgb';
  const LinearMipmapLinearFilter = 1008;
  const LinearFilter = 1006;
  return { Group, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial, MeshBasicMaterial, RingGeometry, Sprite, SpriteMaterial, CanvasTexture, Shape, Path, ExtrudeGeometry, Color, BackSide, DoubleSide, RepeatWrapping, ClampToEdgeWrapping, SRGBColorSpace, LinearMipmapLinearFilter, LinearFilter };
});

vi.mock('../../three/MaterialManager', () => {
  function MaterialManager(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
  }
  return { MaterialManager };
});

import { buildRackGroup, TOP_PLATE_THICKNESS } from '../../three/rack-builder';
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

  it('side/back shell panels are sized to the body zone (totalH minus top plate and bottom plinth), not the full totalH', async () => {
    const { BoxGeometry } = await import('three');
    const rack = { id: 'r2', name: 'Rack 2', units: 42, x: 0, y: 0 } as any;
    buildRackGroup(rack, materials);
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const shellH = totalH - TOP_PLATE_THICKNESS - RACK_PADDING_BOTTOM;
    // Spanning the full totalH here would volumetrically overlap the top cap / bottom plinth,
    // which own those edge slices — that's genuine z-fighting, not just redundant geometry.
    const usesFullTotalH = vi.mocked(BoxGeometry).mock.calls.some(([, h]) => h === totalH);
    const usesShellH = vi.mocked(BoxGeometry).mock.calls.some(([, h]) => h === shellH);
    expect(usesFullTotalH).toBe(false);
    expect(usesShellH).toBe(true);
  });

  it('does not add redundant floating sprites since U-numbers are silk-screened on EIA rails', () => {
    const rack = { id: 'r3', name: 'Rack 3', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    const sprites = group.children.filter((c: any) => c.isSprite);
    expect(sprites).toHaveLength(0);
  });

  // Rail internals (buildRackInternals) are paused — their posts sit almost entirely inside the
  // solid outer side wall's footprint and z-fight against it; see rack-builder.ts's comment at
  // the (commented-out) call site. Revisit once the posts/bay/ear-brackets are repositioned
  // together as a dedicated pass.
  it.skip('includes a rack-internals group as a direct child', () => {
    const rack = { id: 'r5', name: 'Rack 5', units: 42, x: 0, y: 0 } as any;
    const group = buildRackGroup(rack, materials);
    const internals = group.children.find((c: any) => c.name === 'rack-internals');
    expect(internals).toBeDefined();
  });
});
