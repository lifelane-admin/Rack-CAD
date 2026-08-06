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
    this.name = '';
  }
  const BoxGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number, d: number) {
    this.parameters = { width: w, height: h, depth: d };
    this.dispose = vi.fn();
  });
  function MeshStandardMaterial(this: any, p: any) {
    Object.assign(this, p); this.dispose = vi.fn(); this.isMaterial = true;
  }
  function CanvasTexture(this: any) {
    this.dispose = vi.fn(); this.wrapS = 0; this.wrapT = 0;
  }
  const ClampToEdgeWrapping = 1001;
  const DoubleSide = 2;
  return { Group, Mesh, BoxGeometry, MeshStandardMaterial, CanvasTexture, ClampToEdgeWrapping, DoubleSide };
});

vi.mock('../../three/MaterialManager', () => {
  function MaterialManager(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
  }
  return { MaterialManager };
});

import { buildRackInternals } from '../../three/rack-internals';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RACK_INNER_WIDTH, RAIL_WIDTH } = RACK_CONSTANTS;

describe('buildRackInternals', () => {
  let materials: MaterialManager;
  const rack = { id: 'r1', units: 42, x: 0, y: 0 } as any;
  const bodyH = 42 * 30; // rack.units * RU_HEIGHT

  beforeEach(() => {
    materials = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns a Group named rack-internals', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    expect(group.name).toBe('rack-internals');
  });

  it('adds exactly 12 children (4 face plates + 4 flanges + 4 bars)', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    expect(group.children).toHaveLength(12);
  });

  it('all 12 children are meshes', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    for (const child of group.children) {
      expect((child as any).isMesh).toBe(true);
    }
  });

  it('places front face plates at z = 297.5', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    const frontFaces = group.children.filter((c: any) =>
      c.name.startsWith('rack-rail-front-face')
    );
    expect(frontFaces).toHaveLength(2);
    for (const face of frontFaces) {
      expect((face as any).position.set).toHaveBeenCalledWith(
        expect.any(Number), 0, 297.5
      );
    }
  });

  it('places rear face plates at z = -247.5', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    const rearFaces = group.children.filter((c: any) =>
      c.name.startsWith('rack-rail-rear-face')
    );
    expect(rearFaces).toHaveLength(2);
    for (const face of rearFaces) {
      expect((face as any).position.set).toHaveBeenCalledWith(
        expect.any(Number), 0, -247.5
      );
    }
  });

  it('places left face plates at x = -212.5 and right at x = +212.5', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    const faces = group.children.filter((c: any) => c.name.includes('face'));
    const xs = faces.map((f: any) => (f as any).position.set.mock.calls[0][0]);
    expect(xs).toContain(-(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2));
    expect(xs).toContain( (RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2));
  });

  it('depth bars have barLen = 540', async () => {
    const { BoxGeometry } = await import('three');
    buildRackInternals(rack, bodyH, materials);
    const barCalls = vi.mocked(BoxGeometry).mock.calls.filter(
      (args) => args[2] === 540
    );
    expect(barCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('depth bars sit at top and bottom of bodyH', () => {
    const group = buildRackInternals(rack, bodyH, materials);
    const bars = group.children.filter((c: any) => c.name.startsWith('rack-bar'));
    expect(bars).toHaveLength(4);
    const ys = bars.map((b: any) => (b as any).position.set.mock.calls[0][1]);
    expect(ys).toContain(bodyH / 2 - 8);
    expect(ys).toContain(-bodyH / 2 + 8);
  });
});
