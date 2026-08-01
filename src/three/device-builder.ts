import * as THREE from 'three';
import type { DeviceData, DeviceTemplate, RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';
import { RACK_DEPTH } from './rack-builder';

const { RU_HEIGHT, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;
const DEVICE_W = RACK_INNER_WIDTH - 2 * RAIL_WIDTH; // 350 units
const DEVICE_DEPTH = RACK_DEPTH * 0.93;             // placeholder; Phase 3.2 makes this parametric

export function buildDeviceMesh(
  device: DeviceData,
  template: DeviceTemplate,
  rack: RackData,
  materials: MaterialManager
): THREE.Mesh {
  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const deviceH = template.heightUnits * RU_HEIGHT - 1; // 1 unit gap between devices

  const geo = new THREE.BoxGeometry(DEVICE_W, deviceH, DEVICE_DEPTH);
  const mat = materials.get('device', template.color);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `device-${device.id}`;

  // Position within the rack Group (Group origin = rack center height, floor at y=0).
  // startUnit is 1-based from the bottom.
  const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
  mesh.position.set(0, -totalH / 2 + deviceYFromBottom, 0);

  return mesh;
}
