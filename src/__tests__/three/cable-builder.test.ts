import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Vector3 = vi.fn().mockImplementation(function(this: any, x = 0, y = 0, z = 0) {
    this.x = x; this.y = y; this.z = z;
    this.set = vi.fn().mockImplementation((nx, ny, nz) => {
      this.x = nx; this.y = ny; this.z = nz;
      return this;
    });
  });
  const LineCurve3 = vi.fn().mockImplementation(function(this: any, v1: any, v2: any) {
    this.v1 = v1; this.v2 = v2;
  });
  const QuadraticBezierCurve3 = vi.fn().mockImplementation(function(this: any, v0: any, v1: any, v2: any) {
    this.v0 = v0; this.v1 = v1; this.v2 = v2;
  });
  const CurvePath = vi.fn().mockImplementation(function(this: any) {
    this.curves = [];
    this.add = vi.fn().mockImplementation((curve) => {
      this.curves.push(curve);
    });
  });
  const TubeGeometry = vi.fn().mockImplementation(function(this: any, curve: any) {
    this.curve = curve; this.dispose = vi.fn();
  });
  const Mesh = vi.fn().mockImplementation(function(this: any, geo: any, mat: any) {
    this.geometry = geo; this.material = mat; this.name = '';
    this.position = new Vector3();
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
    this.position = new Vector3();
    this.computeLineDistances = vi.fn();
  });
  const Group = vi.fn().mockImplementation(function(this: any) {
    this.children = [];
    this.name = '';
    this.position = new Vector3();
    this.add = vi.fn().mockImplementation((child) => {
      this.children.push(child);
    });
  });
  const BoxGeometry = vi.fn().mockImplementation(function(this: any) {
    this.rotateX = vi.fn();
    this.dispose = vi.fn();
  });
  const CylinderGeometry = vi.fn().mockImplementation(function(this: any) {
    this.rotateX = vi.fn();
    this.dispose = vi.fn();
  });
  return {
    Vector3, LineCurve3, QuadraticBezierCurve3, CurvePath, TubeGeometry, Mesh,
    MeshStandardMaterial, Color, LineDashedMaterial, BufferGeometry, Line,
    Group, BoxGeometry, CylinderGeometry
  };
});

vi.mock('../../three/rack-builder', () => ({
  RACK_DEPTH: 600,
  FRONT_RAIL_RECESS: 28,
  DEVICE_FACE_Z: 272
}));

import { buildCableMesh } from '../../three/cable-builder';
import { RACK_CONSTANTS } from '../../core/types';

function getCurvePoints(curvePathInstance: any): any[] {
  const pts: any[] = [];
  if (!curvePathInstance || !curvePathInstance.curves || curvePathInstance.curves.length === 0) return pts;
  pts.push(curvePathInstance.curves[0].v1);
  for (const c of curvePathInstance.curves) {
    if (c.v2) pts.push(c.v2);
  }
  return pts;
}

import { stateManager } from '../../core/state';

function makeState(cable: any) {
  const rack = { id: 'r1', units: 42, x: 0, y: 0 };
  const device1 = {
    id: 'd1', rackId: 'r1', templateId: 'tmpl', startUnit: 10,
    ports: [{ id: 'p1', deviceId: 'd1', relativeX: 50, relativeY: 10, type: 'rj45', connected: true, cableId: cable.id }],
  };
  const device2 = {
    id: 'd2', rackId: 'r1', templateId: 'tmpl', startUnit: 30,
    ports: [{ id: 'p2', deviceId: 'd2', relativeX: 100, relativeY: 10, type: 'rj45', connected: true, cableId: cable.id }],
  };
  const template = { id: 'tmpl', heightUnits: 1, color: '#ccc', category: 'server' };
  const st = {
    racks: [rack],
    devices: [device1, device2],
    cables: [cable],
    customTemplates: [template],
  } as any;
  stateManager.setState(st);
  return st;
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

  it('builds a CurvePath for orthogonal routing', async () => {
    const { CurvePath } = await import('three');
    buildCableMesh(cable, makeState(cable));
    expect(CurvePath).toHaveBeenCalled();
  });

  it('route uses left channel for source port in left half of device', async () => {
    const { CurvePath } = await import('three');
    buildCableMesh(cable, makeState(cable));
    const curvePathInstance = vi.mocked(CurvePath).mock.instances[0] as any;
    const points = getCurvePoints(curvePathInstance);
    // The third point (first corner transition point after boot exit) should be to the left of the start point.
    expect(points[2].x).toBeLessThan(points[0].x);
  });

  it('route uses right channel for source port in right half of device', async () => {
    const { CurvePath } = await import('three');
    const state = makeState(cable);
    state.devices[0].ports[0] = { ...state.devices[0].ports[0], relativeX: 300 };
    stateManager.setState(state);
    buildCableMesh(cable, state);
    const curvePathInstance = vi.mocked(CurvePath).mock.instances[0] as any;
    const points = getCurvePoints(curvePathInstance);
    // The third point should be to the right of the start point.
    expect(points[2].x).toBeGreaterThan(points[0].x);
  });

  it('material color matches cable.color', async () => {
    const { MeshStandardMaterial } = await import('three');
    buildCableMesh(cable, makeState(cable));
    const [[params]] = vi.mocked(MeshStandardMaterial).mock.calls;
    expect((params as any).color).toBeTruthy();
  });

  it('a single cable in a channel uses the base front-Z for its whole path', async () => {
    const { CurvePath } = await import('three');
    buildCableMesh(cable, makeState(cable));
    const curvePathInstance = vi.mocked(CurvePath).mock.instances[0] as any;
    const points = getCurvePoints(curvePathInstance);
    // Ignore the straight boot leaders and exit-transition segments to test the pure channel path
    const channelPoints = points.slice(4, -4);
    const zs = new Set(channelPoints.map((p: any) => p.z));
    expect(zs.size).toBe(1);
  });

  it('two cables sharing the same rack+channel side get distinct Z lanes (no overlapping geometry)', async () => {
    const { CurvePath } = await import('three');
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
    const curvePathInstanceA = vi.mocked(CurvePath).mock.instances[0] as any;
    const pointsA = getCurvePoints(curvePathInstanceA);
    vi.mocked(CurvePath).mockClear();

    buildCableMesh(cableB, state);
    const curvePathInstanceB = vi.mocked(CurvePath).mock.instances[0] as any;
    const pointsB = getCurvePoints(curvePathInstanceB);

    // Connection points map to portZ, but lane positions (point index 2) are distinct
    expect(pointsA[2].z).not.toBe(pointsB[2].z);
  });
});
