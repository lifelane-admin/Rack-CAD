import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Group = vi.fn().mockImplementation(function(this: any) {
    this.name = '';
    this.children = [] as any[];
    this.position = { set: vi.fn() };
    this.add = vi.fn().mockImplementation(function(this: any, c: any) { this.children.push(c); });
    this.remove = vi.fn();
    this.rotation = { x: 0 };
  });
  const Scene = vi.fn().mockImplementation(function(this: any) {
    this.add = vi.fn();
    this.remove = vi.fn();
    this.clear = vi.fn();
    this.background = null;
    this.environment = null;
    this.fog = null;
  });
  const Mesh = vi.fn().mockImplementation(function(this: any, g: any, m: any) {
    this.geometry = g;
    this.material = m;
    this.name = '';
    this.position = { set: vi.fn(), y: 0 };
    this.rotation = { x: 0 };
  });
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
  const FogExp2 = vi.fn().mockImplementation(function(this: any) {});
  const Color = vi.fn().mockImplementation(function(this: any, c: any) { this.value = c; });
  const BackSide = 1;
  return { Group, Scene, Mesh, BoxGeometry, PlaneGeometry, MeshStandardMaterial, HemisphereLight, FogExp2, Color, BackSide };
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
}));

vi.mock('../../three/device-builder', () => ({
  buildDeviceMesh: vi.fn().mockImplementation(function(device: any) {
    const { Mesh, BoxGeometry, MeshStandardMaterial } = require('three');
    const m = new Mesh(new BoxGeometry(350, 59, 558), new MeshStandardMaterial());
    m.name = `device-${device.id}`;
    return m;
  }),
}));

vi.mock('../../library/device-catalog', () => ({
  getTemplate: vi.fn().mockReturnValue({ id: 'tmpl', heightUnits: 2, color: '#ccc', category: 'server' }),
}));

import { SceneManager } from '../../three/SceneManager';
import { MaterialManager } from '../../three/MaterialManager';
import { buildDeviceMesh } from '../../three/device-builder';

const makeState = (racks: any[], devices: any[], customTemplates: any[] = []) =>
  ({ racks, devices, customTemplates } as any);

describe('SceneManager', () => {
  let mgr: SceneManager;
  let materials: MaterialManager;

  beforeEach(() => {
    materials = new MaterialManager();
    mgr = new SceneManager(materials);
    vi.clearAllMocks();
  });

  it('exposes a THREE.Scene', () => {
    expect(mgr.scene).toBeDefined();
  });

  it('rebuild adds a Group for a new rack', () => {
    const state = makeState([{ id: 'r1', units: 42, x: 0, y: 0 }], []);
    mgr.rebuild(state);
    expect(mgr.scene.add).toHaveBeenCalled();
  });

  it('rebuild removes a Group when rack is deleted', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 };
    mgr.rebuild(makeState([rack], []));
    // Clear mock call counts so we only see the second rebuild's calls
    vi.mocked(mgr.scene.remove).mockClear();
    mgr.rebuild(makeState([], []));
    expect(mgr.scene.remove).toHaveBeenCalled();
  });

  it('rebuild does not re-add existing rack on second call', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 };
    mgr.rebuild(makeState([rack], []));
    const addCallCount = vi.mocked(mgr.scene.add).mock.calls.length;
    mgr.rebuild(makeState([rack], []));
    expect(vi.mocked(mgr.scene.add).mock.calls.length).toBe(addCallCount);
  });

  it('rebuild calls buildDeviceMesh for a new device', () => {
    const rack = { id: 'r1', units: 42, x: 0, y: 0 };
    const device = { id: 'd1', rackId: 'r1', templateId: 'tmpl', startUnit: 1 };
    mgr.rebuild(makeState([rack], [device]));
    expect(buildDeviceMesh).toHaveBeenCalledWith(device, expect.anything(), rack, materials);
  });
});
