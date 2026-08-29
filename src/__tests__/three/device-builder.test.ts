import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  function Group(this: any) {
    this.name = '';
    this.children = [] as any[];
    this.position = { set: vi.fn() };
    this.add = vi.fn().mockImplementation(function(this: any, c: any) { this.children.push(c); });
    this.remove = vi.fn();
    this.userData = {};
  }
  const Mesh = vi.fn().mockImplementation(function(this: any, geo: any, mat: any) {
    this.geometry = geo;
    this.material = mat;
    this.name = '';
    this.position = { set: vi.fn() };
    this.userData = {};
  });
  const BoxGeometry = vi.fn().mockImplementation(function(this: any, w: number, h: number, d: number) {
    this.parameters = { width: w, height: h, depth: d };
    this.dispose = vi.fn();
  });
  const MeshStandardMaterial = vi.fn().mockImplementation(function(this: any, p: any) {
    Object.assign(this, p);
    this.dispose = vi.fn();
    this.isMaterial = true;
  });
  return { Group, Mesh, BoxGeometry, MeshStandardMaterial };
});

vi.mock('../../three/MaterialManager', () => ({
  MaterialManager: vi.fn().mockImplementation(function(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
    this.getTextured = vi.fn().mockReturnValue({ isMaterial: true, map: {}, dispose: vi.fn() });
    this.getFrontPanel = vi.fn().mockReturnValue({ isMaterial: true, map: {}, dispose: vi.fn() });
  }),
}));

vi.mock('../../three/svg-texture', () => ({
  getDeviceFrontMaterial: vi.fn().mockReturnValue({ isMaterial: true, map: {}, dispose: vi.fn() }),
  disposeSVGTextures: vi.fn(),
}));

vi.mock('../../three/device-accessories', () => ({
  buildLedMeshes: vi.fn().mockReturnValue([]),
  buildPortBezels: vi.fn().mockReturnValue([]),
  buildLogoPlaque: vi.fn().mockReturnValue(null),
  buildServerAccessories: vi.fn().mockReturnValue([]),
}));

import { buildDeviceMesh } from '../../three/device-builder';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEFAULT_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350

describe('buildDeviceMesh', () => {
  let materials: MaterialManager;

  const rack = { id: 'r1', units: 42, x: 0, y: 0 } as any;
  const template = { id: 'tmpl', heightUnits: 2, color: '#1a3a6a', category: 'server' } as any;
  const device = { id: 'd1', templateId: 'tmpl', startUnit: 1, rackId: 'r1' } as any;

  beforeEach(() => {
    materials = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns { mesh, earMeshes } — mesh named device-<id>', () => {
    const { mesh } = buildDeviceMesh(device, template, rack, materials);
    expect(mesh.name).toBe('device-d1');
  });

  it('uses default width (350) when no device3D config', async () => {
    const { BoxGeometry } = await import('three');
    buildDeviceMesh(device, template, rack, materials);
    const [[w]] = vi.mocked(BoxGeometry).mock.calls;
    expect(w).toBe(DEFAULT_W);
  });

  it('uses device3D.width when provided', async () => {
    const { BoxGeometry } = await import('three');
    const narrowDevice = { ...device, device3D: { depth: 500, width: 200 } };
    buildDeviceMesh(narrowDevice, template, rack, materials);
    const [[w]] = vi.mocked(BoxGeometry).mock.calls;
    expect(w).toBe(200);
  });

  it('uses device3D.depth when provided', async () => {
    const { BoxGeometry } = await import('three');
    const deepDevice = { ...device, device3D: { depth: 700, width: DEFAULT_W } };
    buildDeviceMesh(deepDevice, template, rack, materials);
    const [[,, d]] = vi.mocked(BoxGeometry).mock.calls;
    expect(d).toBe(700);
  });

  it('falls back to template.default3D.depth if no device3D', async () => {
    const { BoxGeometry } = await import('three');
    const tmplWithDefault = { ...template, default3D: { depth: 650, width: DEFAULT_W } };
    buildDeviceMesh(device, tmplWithDefault, rack, materials);
    const [[,, d]] = vi.mocked(BoxGeometry).mock.calls;
    expect(d).toBe(650);
  });

  it('geometry height = heightUnits * RU_HEIGHT', async () => {
    const { BoxGeometry } = await import('three');
    buildDeviceMesh(device, template, rack, materials);
    const [[, h]] = vi.mocked(BoxGeometry).mock.calls;
    expect(h).toBe(template.heightUnits * RU_HEIGHT);
  });

  it('sets vertical position for startUnit=1', () => {
    const { group } = buildDeviceMesh(device, template, rack, materials);
    const [, yArg] = (group.position.set as ReturnType<typeof vi.fn>).mock.calls[0];
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const deviceYFromBottom = RACK_PADDING_BOTTOM + (0 + template.heightUnits / 2) * RU_HEIGHT;
    expect(yArg).toBeCloseTo(-totalH / 2 + deviceYFromBottom);
  });

  it('returns earMeshes when device is narrower than rack width', async () => {
    const { BoxGeometry } = await import('three');
    const narrowDevice = { ...device, device3D: { depth: 500, width: 200 } };
    const { earMeshes } = buildDeviceMesh(narrowDevice, template, rack, materials);
    expect(earMeshes).toHaveLength(2);
    // Each ear width = (RACK_INNER_WIDTH - 200) / 2 = 100
    const earCall = vi.mocked(BoxGeometry).mock.calls[1]; // second BoxGeometry call
    expect(earCall[0]).toBeCloseTo(100);
  });

  it('returns empty earMeshes when device is full rack width', () => {
    const fullDevice = { ...device, device3D: { depth: 500, width: RACK_INNER_WIDTH } };
    const { earMeshes } = buildDeviceMesh(fullDevice, template, rack, materials);
    expect(earMeshes).toHaveLength(0);
  });

  it('ear meshes are created with correct width for narrow device', async () => {
    const { BoxGeometry } = await import('three');
    const narrowDevice = { ...device, device3D: { depth: 500, width: 200 } };
    const { earMeshes } = buildDeviceMesh(narrowDevice, template, rack, materials);
    expect(earMeshes).toHaveLength(2);
    // Each ear width = (400 - 200) / 2 = 100
    const earCall = vi.mocked(BoxGeometry).mock.calls[1];
    expect(earCall[0]).toBeCloseTo(100);
  });

  it('uses per-face material array when frontPanelImage is set', async () => {
    const { Mesh } = await import('three');
    const deviceWithImage = { ...device, frontPanelImage: 'data:image/png;base64,abc' };
    buildDeviceMesh(deviceWithImage, template, rack, materials);
    const meshCall = vi.mocked(Mesh).mock.calls[0];
    // Second arg to Mesh constructor should be an array (6 materials) not a single material
    expect(Array.isArray(meshCall[1])).toBe(true);
    expect((meshCall[1] as any[]).length).toBe(6);
  });

  it('always uses per-face material array (SVG texture for front face when no image)', async () => {
    const { Mesh } = await import('three');
    const { getDeviceFrontMaterial } = await import('../../three/svg-texture');
    buildDeviceMesh(device, template, rack, materials);
    const meshCall = vi.mocked(Mesh).mock.calls[0];
    expect(Array.isArray(meshCall[1])).toBe(true);
    expect((meshCall[1] as any[]).length).toBe(6);
    expect(getDeviceFrontMaterial).toHaveBeenCalledWith(device, template);
  });
});
