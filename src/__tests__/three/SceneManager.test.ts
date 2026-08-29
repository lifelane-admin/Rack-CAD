import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  function Scene(this: any) {
    this.add = vi.fn();
    this.remove = vi.fn();
    this.clear = vi.fn();
    this.traverse = vi.fn();
    this.background = null;
    this.environment = null;
    this.fog = null;
  }
  function Group(this: any) {
    this.name = '';
    this.children = [] as any[];
    this.position = { set: vi.fn() };
    this.add = vi.fn().mockImplementation(function(this: any, c: any) { this.children.push(c); });
    this.remove = vi.fn();
    this.rotation = { x: 0 };
  }
  function Mesh(this: any, g: any, m: any) {
    this.geometry = g ?? { dispose: vi.fn() };
    this.material = m;
    this.name = '';
    this.isMesh = true;
    this.position = { set: vi.fn(), setY: vi.fn(), y: 0 };
    this.rotation = { x: 0 };
  }
  const BoxGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number, d: number) {
    this.parameters = { width: w, height: h, depth: d };
    this.dispose = vi.fn();
  });
  const PlaneGeometry = vi.fn().mockImplementation(function(this: any) {
    this.dispose = vi.fn();
  });
  const MeshStandardMaterial = vi.fn().mockImplementation(function(this: any, p: any) {
    Object.assign(this, p);
    this.dispose = vi.fn();
    this.isMaterial = true;
  });
  const HemisphereLight = vi.fn().mockImplementation(function(this: any) {
    this.position = { set: vi.fn() };
  });
  const AmbientLight = vi.fn().mockImplementation(function(this: any) {});
  const DirectionalLight = vi.fn().mockImplementation(function(this: any) {
    this.position = { set: vi.fn() };
  });
  const FogExp2 = vi.fn().mockImplementation(function(this: any) {});
  const Color = vi.fn().mockImplementation(function(this: any, c: any) { this.value = c; });
  const BackSide = 1;
  return { Group, Scene, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial, HemisphereLight, AmbientLight, DirectionalLight, FogExp2, Color, BackSide };
});

vi.mock('../../three/MaterialManager', () => ({
  MaterialManager: vi.fn().mockImplementation(function(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
    this.dispose = vi.fn();
  }),
}));

vi.mock('../../three/rack-builder', () => ({
  buildRackGroup: vi.fn().mockImplementation(function(rack: any) {
    const { Group } = require('three');
    const g = new Group();
    g.name = `rack-${rack.id}`;
    return g;
  }),
  RACK_DEPTH: 600,
  DEVICE_FACE_Z: 272,
}));

vi.mock('../../three/device-builder', () => ({
  buildDeviceMesh: vi.fn().mockImplementation(function(device: any) {
    const { Group, Mesh, BoxGeometry, MeshStandardMaterial } = require('three');
    const g = new Group();
    const m = new Mesh(new BoxGeometry(350, 59, 500), new MeshStandardMaterial());
    m.name = `device-${device.id}`;
    g.name = `device-group-${device.id}`;
    g.add(m);
    return { group: g, mesh: m, earMeshes: [], ledMeshes: [], portMeshes: [] };
  }),
}));

vi.mock('../../three/svg-texture', () => ({
  getDeviceFrontMaterial: vi.fn().mockReturnValue({ isMaterial: true, map: {}, dispose: vi.fn() }),
  disposeSVGTextures: vi.fn(),
}));

vi.mock('../../three/cable-builder', () => ({
  buildCableMesh: vi.fn().mockImplementation(function(cable: any) {
    if (!cable.sourcePortId || !cable.destPortId) return null;
    const { Mesh, BoxGeometry, MeshStandardMaterial } = require('three');
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    m.name = `cable-${cable.id}`;
    m.geometry.dispose = vi.fn();
    return m;
  }),
}));

vi.mock('../../library/device-catalog', () => ({
  getTemplate: vi.fn().mockReturnValue({ id: 'tmpl', heightUnits: 2, color: '#ccc', category: 'server' }),
}));

import { SceneManager } from '../../three/SceneManager';
import { MaterialManager } from '../../three/MaterialManager';
import { buildDeviceMesh } from '../../three/device-builder';
import { buildCableMesh } from '../../three/cable-builder';

const makeState = (racks: any[], devices: any[], customTemplates: any[] = []) =>
  ({ racks, devices, cables: [], customTemplates } as any);

describe('SceneManager', () => {
  let mgr: SceneManager;
  let materials: MaterialManager;

  const rack = { id: 'r1', units: 42, x: 0, y: 0 };
  const device = { id: 'd1', rackId: 'r1', templateId: 'tmpl', startUnit: 1, ports: [] };

  beforeEach(() => {
    materials = new MaterialManager();
    mgr = new SceneManager(materials);
    vi.clearAllMocks();
  });

  it('exposes a THREE.Scene', () => {
    expect(mgr.scene).toBeDefined();
  });

  it('rebuild adds a Group for a new rack', () => {
    mgr.rebuild(makeState([rack], []));
    expect(mgr.scene.add).toHaveBeenCalled();
  });

  it('rebuild removes a Group when rack is deleted', () => {
    mgr.rebuild(makeState([rack], []));
    vi.mocked(mgr.scene.remove).mockClear();
    mgr.rebuild(makeState([], []));
    expect(mgr.scene.remove).toHaveBeenCalled();
  });

  it('rebuild does not re-add existing rack on second call', () => {
    mgr.rebuild(makeState([rack], []));
    const addCallCount = vi.mocked(mgr.scene.add).mock.calls.length;
    mgr.rebuild(makeState([rack], []));
    expect(vi.mocked(mgr.scene.add).mock.calls.length).toBe(addCallCount);
  });

  it('rebuild calls buildDeviceMesh for a new device', () => {
    mgr.rebuild(makeState([rack], [device]));
    expect(buildDeviceMesh).toHaveBeenCalledWith(device, expect.anything(), rack, materials);
  });

  it('rebuild does NOT call buildDeviceMesh again when geometry hash unchanged', () => {
    const state = makeState([rack], [device]);
    mgr.rebuild(state);
    vi.mocked(buildDeviceMesh).mockClear();
    mgr.rebuild(state); // same state — same hash
    expect(buildDeviceMesh).not.toHaveBeenCalled();
  });

  it('rebuild DOES call buildDeviceMesh again when device3D depth changes', () => {
    mgr.rebuild(makeState([rack], [device]));
    vi.mocked(buildDeviceMesh).mockClear();
    const changedDevice = { ...device, device3D: { depth: 700, width: 350 } };
    mgr.rebuild(makeState([rack], [changedDevice]));
    expect(buildDeviceMesh).toHaveBeenCalledTimes(1);
  });

  it('rebuild calls buildDeviceMesh again when a deleted device is re-added', () => {
    mgr.rebuild(makeState([rack], [device]));
    mgr.rebuild(makeState([rack], [])); // remove
    vi.mocked(buildDeviceMesh).mockClear();
    mgr.rebuild(makeState([rack], [device])); // re-add
    expect(buildDeviceMesh).toHaveBeenCalledTimes(1);
  });

  it('dispose clears scene and maps', () => {
    mgr.rebuild(makeState([rack], [device]));
    mgr.dispose();
    expect(mgr.scene.clear).toHaveBeenCalled();
  });
});

// Cable routing in 3D is paused again (SceneManager.rebuild() no longer calls syncCables()) —
// revisit and re-enable this suite when that work resumes. cable-builder.ts's own routing/lane
// logic is still covered directly by cable-builder.test.ts.
describe.skip('SceneManager — syncCables', () => {
  let mgr: SceneManager;
  let materials: MaterialManager;

  const rack = { id: 'r1', units: 42, x: 0, y: 0 };
  const device1 = { id: 'd1', rackId: 'r1', templateId: 'tmpl', startUnit: 1, ports: [] };
  const device2 = { id: 'd2', rackId: 'r1', templateId: 'tmpl', startUnit: 5, ports: [] };
  const cable = {
    id: 'c1', type: 'cat6', color: '#fff',
    sourcePortId: 'p1', destPortId: 'p2',
    bendPoints: [], thickness: 2, bendRadius: 10, bundleId: null, notes: '',
  };

  beforeEach(() => {
    materials = new MaterialManager();
    mgr = new SceneManager(materials);
    vi.clearAllMocks();
  });

  it('rebuild adds cable mesh to scene when cable exists', () => {
    const state = { ...makeState([rack], [device1, device2]), cables: [cable] } as any;
    mgr.rebuild(state);
    expect(buildCableMesh).toHaveBeenCalledWith(cable, state);
    expect(mgr.scene.add).toHaveBeenCalled();
  });

  it('rebuild removes cable mesh when cable is deleted', () => {
    const state1 = { ...makeState([rack], [device1, device2]), cables: [cable] } as any;
    mgr.rebuild(state1);
    vi.mocked(mgr.scene.remove).mockClear();
    const state2 = { ...makeState([rack], [device1, device2]), cables: [] } as any;
    mgr.rebuild(state2);
    expect(mgr.scene.remove).toHaveBeenCalled();
  });

  it('rebuild skips null return from buildCableMesh', () => {
    const floatingCable = { ...cable, destPortId: null };
    const state = { ...makeState([rack], [device1]), cables: [floatingCable] } as any;
    expect(() => mgr.rebuild(state)).not.toThrow();
  });
});
