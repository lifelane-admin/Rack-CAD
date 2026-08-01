import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', () => {
  const Mesh = vi.fn().mockImplementation(function(this: any, geo: any, mat: any) {
    this.geometry = geo;
    this.material = mat;
    this.name = '';
    this.position = { set: vi.fn() };
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
  return { Mesh, BoxGeometry, MeshStandardMaterial };
});

vi.mock('../../three/MaterialManager', () => ({
  MaterialManager: vi.fn().mockImplementation(function(this: any) {
    this.get = vi.fn().mockReturnValue({ isMaterial: true, dispose: vi.fn() });
  }),
}));

vi.mock('../../three/rack-builder', () => ({
  RACK_DEPTH: 600,
}));

import { buildDeviceMesh } from '../../three/device-builder';
import { MaterialManager } from '../../three/MaterialManager';
import { RACK_CONSTANTS } from '../../core/types';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEVICE_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350

describe('buildDeviceMesh', () => {
  let materials: MaterialManager;

  const rack = { id: 'r1', units: 42, x: 0, y: 0 } as any;
  const template = { id: 'tmpl', heightUnits: 2, color: '#1a3a6a', category: 'server' } as any;
  const device = { id: 'd1', templateId: 'tmpl', startUnit: 1, rackId: 'r1' } as any;

  beforeEach(() => {
    materials = new MaterialManager();
    vi.clearAllMocks();
  });

  it('returns a mesh named device-<id>', () => {
    const mesh = buildDeviceMesh(device, template, rack, materials);
    expect(mesh.name).toBe('device-d1');
  });

  it('geometry width matches inner rack width minus rails', async () => {
    const { BoxGeometry } = await import('three');
    buildDeviceMesh(device, template, rack, materials);
    const [[w]] = vi.mocked(BoxGeometry).mock.calls;
    expect(w).toBe(DEVICE_W);
  });

  it('geometry height = heightUnits * RU_HEIGHT minus 1px gap', async () => {
    const { BoxGeometry } = await import('three');
    buildDeviceMesh(device, template, rack, materials);
    const [[, h]] = vi.mocked(BoxGeometry).mock.calls;
    expect(h).toBe(template.heightUnits * RU_HEIGHT - 1);
  });

  it('sets vertical position within rack group correctly for startUnit=1', () => {
    const mesh = buildDeviceMesh(device, template, rack, materials);
    expect(mesh.position.set).toHaveBeenCalled();
    const [, yArg] = (mesh.position.set as ReturnType<typeof vi.fn>).mock.calls[0];
    const totalH = RACK_PADDING_TOP + 42 * RU_HEIGHT + RACK_PADDING_BOTTOM;
    const deviceYFromBottom = RACK_PADDING_BOTTOM + (0 + template.heightUnits / 2) * RU_HEIGHT;
    expect(yArg).toBeCloseTo(-totalH / 2 + deviceYFromBottom);
  });

  it('asks MaterialManager for device material with template color', () => {
    buildDeviceMesh(device, template, rack, materials);
    expect(materials.get).toHaveBeenCalledWith('device', '#1a3a6a');
  });
});
