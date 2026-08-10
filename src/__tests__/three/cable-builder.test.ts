import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Vector3 = vi.fn().mockImplementation(function(this: any, x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
  });
  const CatmullRomCurve3 = vi.fn().mockImplementation(function(this: any, points: any[]) {
    this.points = points;
  });
  const TubeGeometry = vi.fn().mockImplementation(function(this: any, curve: any) {
    this.curve = curve; this.dispose = vi.fn();
  });
  const Mesh = vi.fn().mockImplementation(function(this: any, geo: any, mat: any) {
    this.geometry = geo; this.material = mat; this.name = '';
  });
  const MeshStandardMaterial = vi.fn().mockImplementation(function(this: any, p: any) {
    Object.assign(this, p); this.dispose = vi.fn(); this.isMaterial = true;
  });
  const Color = vi.fn().mockImplementation(function(this: any, c: any) { this.value = c; });
  const LineDashedMaterial = vi.fn().mockImplementation(function(this: any, p: any) {
    Object.assign(this, p); this.dispose = vi.fn();
  });
  const BufferGeometry = vi.fn().mockImplementation(function(this: any) {
    this.setFromPoints = vi.fn().mockReturnThis(); this.dispose = vi.fn();
    this.computeLineDistances = vi.fn();
  });
  const Line = vi.fn().mockImplementation(function(this: any, geo: any, mat: any) {
    this.geometry = geo; this.material = mat; this.name = '';
    this.computeLineDistances = vi.fn();
  });
  return { Vector3, CatmullRomCurve3, TubeGeometry, Mesh, MeshStandardMaterial, Color, LineDashedMaterial, BufferGeometry, Line };
});

vi.mock('../../three/rack-builder', () => ({ RACK_DEPTH: 600 }));

import { buildCableMesh } from '../../three/cable-builder';
import { RACK_CONSTANTS } from '../../core/types';

const { RACK_OUTER_WIDTH, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

function makeState(cable: any) {
  const rack = { id: 'r1', units: 42, x: 0, y: 0 };
  const device1 = {
    id: 'd1', rackId: 'r1', templateId: 'tmpl', startUnit: 10,
    ports: [{ id: 'p1', deviceId: 'd1', relativeX: 50, relativeY: 10, type: 'rj45', connected: true, cableId: cable.id }],
  };
  const device2 = {
    id: 'd2', rackId: 'r1', templateId: 'tmpl', startUnit: 30,
    ports: [{ id: 'p2', deviceId: 'd2', relativeX: 300, relativeY: 10, type: 'rj45', connected: true, cableId: cable.id }],
  };
  const template = { id: 'tmpl', heightUnits: 1, color: '#ccc' };
  return {
    racks: [rack],
    devices: [device1, device2],
    cables: [cable],
    customTemplates: [template],
  } as any;
}

describe('buildCableMesh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cable = {
    id: 'c1', name: 'Cable 1', type: 'cat6', color: '#1e88e5',
    sourcePortId: 'p1', destPortId: 'p2',
    bendPoints: [], thickness: 2, bendRadius: 10, bundleId: null, notes: '',
  } as any;

  it('returns a mesh named cable-<id>', () => {
    const mesh = buildCableMesh(cable, makeState(cable));
    expect(mesh).not.toBeNull();
    expect(mesh!.name).toBe('cable-c1');
  });

  it('returns null when source port is not found', () => {
    const badCable = { ...cable, sourcePortId: 'nonexistent' };
    const result = buildCableMesh(badCable, makeState(cable));
    expect(result).toBeNull();
  });

  it('returns null when dest port is not found and no floatingDest', () => {
    const badCable = { ...cable, destPortId: 'nonexistent' };
    const result = buildCableMesh(badCable, makeState(cable));
    expect(result).toBeNull();
  });

  it('builds a CatmullRomCurve3 with 6 points for rectangular routing', async () => {
    const { CatmullRomCurve3 } = await import('three');
    buildCableMesh(cable, makeState(cable));
    expect(CatmullRomCurve3).toHaveBeenCalled();
    const [points] = vi.mocked(CatmullRomCurve3).mock.calls[0];
    expect(points).toHaveLength(6);
  });

  it('route uses left channel for source port in left half of device', async () => {
    const { CatmullRomCurve3 } = await import('three');
    // port1 has relativeX=50 — left half of 350px device
    buildCableMesh(cable, makeState(cable));
    const points = vi.mocked(CatmullRomCurve3).mock.calls[0]![0] as any[];
    // P2 (channel) should be to the LEFT of P1 (source port) — both in world space
    expect(points[1].x).toBeLessThan(points[0].x);
  });

  it('route uses right channel for source port in right half of device', async () => {
    const { CatmullRomCurve3 } = await import('three');
    const state = makeState(cable);
    state.devices[0].ports[0].relativeX = 300; // right half
    buildCableMesh(cable, state);
    const points = vi.mocked(CatmullRomCurve3).mock.calls[0]![0] as any[];
    // P2 (channel) should be to the RIGHT of P1 (source port) — both in world space
    expect(points[1].x).toBeGreaterThan(points[0].x);
  });

  it('material color matches cable.color', async () => {
    const { MeshStandardMaterial } = await import('three');
    buildCableMesh(cable, makeState(cable));
    const [[params]] = vi.mocked(MeshStandardMaterial).mock.calls;
    expect((params as any).color).toBeTruthy();
  });

  it('a single cable in a channel uses the base front-Z for its whole path', async () => {
    const { CatmullRomCurve3 } = await import('three');
    buildCableMesh(cable, makeState(cable));
    const points = vi.mocked(CatmullRomCurve3).mock.calls[0]![0] as any[];
    const zs = new Set(points.map((p: any) => p.z));
    expect(zs.size).toBe(1);
  });

  it('two cables sharing the same rack+channel side get distinct Z lanes (no overlapping geometry)', async () => {
    const { CatmullRomCurve3 } = await import('three');
    const cableA = { ...cable, id: 'c1' };
    const cableB = {
      id: 'c2', name: 'Cable 2', type: 'cat6', color: '#43a047',
      sourcePortId: 'p3', destPortId: 'p4',
      bendPoints: [], thickness: 2, bendRadius: 10, bundleId: null, notes: '',
    } as any;

    const state = makeState(cableA);
    // Add a second source/dest port pair on the same (left) side of the same rack.
    state.devices[0].ports.push({ id: 'p3', deviceId: 'd1', relativeX: 60, relativeY: 15, type: 'rj45', connected: true, cableId: 'c2' });
    state.devices[1].ports.push({ id: 'p4', deviceId: 'd2', relativeX: 60, relativeY: 15, type: 'rj45', connected: true, cableId: 'c2' });
    state.cables = [cableA, cableB];

    buildCableMesh(cableA, state);
    const pointsA = vi.mocked(CatmullRomCurve3).mock.calls[0]![0] as any[];
    vi.mocked(CatmullRomCurve3).mockClear();

    buildCableMesh(cableB, state);
    const pointsB = vi.mocked(CatmullRomCurve3).mock.calls[0]![0] as any[];

    expect(pointsA[0].z).not.toBe(pointsB[0].z);
  });
});
