import * as THREE from 'three';
import type { AppState, RackData, DeviceData, DeviceTemplate } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import type { MaterialManager } from './MaterialManager';
import { buildRackGroup } from './rack-builder';
import { buildDeviceMesh } from './device-builder';

const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

export class SceneManager {
  readonly scene: THREE.Scene;
  private rackGroups = new Map<string, THREE.Group>();
  private deviceMeshes = new Map<string, { mesh: THREE.Mesh; rackId: string }>();
  private materials: MaterialManager;
  private floorGeo: THREE.PlaneGeometry | null = null;

  constructor(materials: MaterialManager) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x060c18, 0.000025);

    const hemi = new THREE.HemisphereLight(0x4466aa, 0x223344, 0.6);
    hemi.position.set(0, 5000, 0);
    this.scene.add(hemi);

    this.floorGeo = new THREE.PlaneGeometry(20000, 20000);
    const floor = new THREE.Mesh(this.floorGeo, this.materials.get('floor'));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    this.scene.add(floor);
  }

  rebuild(state: AppState): void {
    this.syncRacks(state.racks);
    this.syncDevices(state.racks, state.devices, state.customTemplates ?? []);
  }

  private syncRacks(racks: RackData[]): void {
    const incoming = new Set(racks.map(r => r.id));

    for (const [id, group] of this.rackGroups) {
      if (!incoming.has(id)) {
        this.scene.remove(group);
        this.rackGroups.delete(id);
      }
    }

    for (const rack of racks) {
      const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
      if (!this.rackGroups.has(rack.id)) {
        const group = buildRackGroup(rack, this.materials);
        this.scene.add(group);
        this.rackGroups.set(rack.id, group);
      } else {
        this.rackGroups.get(rack.id)!.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
      }
    }
  }

  private syncDevices(racks: RackData[], devices: DeviceData[], customTemplates: DeviceTemplate[]): void {
    const incoming = new Set(devices.map(d => d.id));

    for (const [id, { mesh, rackId }] of this.deviceMeshes) {
      if (!incoming.has(id)) {
        this.rackGroups.get(rackId)?.remove(mesh);
        mesh.geometry.dispose();
        this.deviceMeshes.delete(id);
      }
    }

    for (const device of devices) {
      const template = getTemplate(device.templateId, customTemplates);
      if (!template) continue;
      const rack = racks.find(r => r.id === device.rackId);
      if (!rack) continue;
      const rackGroup = this.rackGroups.get(device.rackId);
      if (!rackGroup) continue;

      const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
      const deviceYFromBottom = RACK_PADDING_BOTTOM + (device.startUnit - 1 + template.heightUnits / 2) * RU_HEIGHT;
      const deviceY = -totalH / 2 + deviceYFromBottom;

      if (!this.deviceMeshes.has(device.id)) {
        const mesh = buildDeviceMesh(device, template, rack, this.materials);
        rackGroup.add(mesh);
        this.deviceMeshes.set(device.id, { mesh, rackId: device.rackId });
      } else {
        this.deviceMeshes.get(device.id)!.mesh.position.set(0, deviceY, 0);
      }
    }
  }

  dispose(): void {
    // Dispose GPU resources for all geometries in the scene before clearing
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
      }
    });
    this.floorGeo?.dispose();
    this.floorGeo = null;
    this.scene.clear();
    this.rackGroups.clear();
    this.deviceMeshes.clear();
  }
}
