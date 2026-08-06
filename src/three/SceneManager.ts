import * as THREE from 'three';
import type { AppState, RackData, DeviceData, DeviceTemplate, CableData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import type { MaterialManager } from './MaterialManager';
import { buildRackGroup } from './rack-builder';
import { buildDeviceMesh } from './device-builder';
import { buildCableMesh } from './cable-builder';
import { getDeviceFrontMaterial, disposeSVGTextures } from './svg-texture';

const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

interface DeviceEntry {
  mesh: THREE.Mesh;
  earMeshes: THREE.Mesh[];
  ledMeshes: THREE.Mesh[];
  portMeshes: THREE.Mesh[];
  rackId: string;
  geometryHash: string;
}

function geometryHash(device: DeviceData, template: DeviceTemplate): string {
  return [
    device.startUnit,
    device.device3D?.depth ?? template.default3D?.depth ?? 500,
    device.device3D?.width ?? template.default3D?.width ?? 350,
    device.frontPanelImage ?? template.frontPanelImage ?? '',
  ].join('|');
}

export type DoorState = 'closed' | 'open' | 'removed';

export class SceneManager {
  readonly scene: THREE.Scene;
  private rackGroups = new Map<string, THREE.Group>();
  private deviceEntries = new Map<string, DeviceEntry>();
  private cableMeshes = new Map<string, THREE.Mesh | THREE.Line>();
  private materials: MaterialManager;
  private doorTargetAngle = 0;  // 0 = closed, Math.PI * 0.7 = open
  constructor(materials: MaterialManager) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060809);

    // Low ambient — just enough to prevent pitch-black shadows
    const ambient = new THREE.AmbientLight(0x1a2535, 2.8);
    this.scene.add(ambient);

    // 4 diagonal studio lights — all at mid-height (Y=600), projecting inward at the rack.
    // No top-down component so there are no ceiling reflections or specular glare from above.

    // NE — front-right (main key, warm white)
    const ne = new THREE.DirectionalLight(0xe8f0ff, 4.5);
    ne.position.set(3000, 600, 3000);
    this.scene.add(ne);

    // NW — front-left (secondary fill, slightly cooler)
    const nw = new THREE.DirectionalLight(0xd0dcf0, 3.0);
    nw.position.set(-3000, 600, 3000);
    this.scene.add(nw);

    // SE — back-right (rim/separation, muted blue-grey)
    const se = new THREE.DirectionalLight(0x6878a0, 2.0);
    se.position.set(3000, 600, -3000);
    this.scene.add(se);

    // SW — back-left (rim/separation, muted blue-grey)
    const sw = new THREE.DirectionalLight(0x5a6a90, 1.5);
    sw.position.set(-3000, 600, -3000);
    this.scene.add(sw);
  }

  rebuild(state: AppState): void {
    this.syncRacks(state.racks);
    this.syncDevices(state.racks, state.devices, state.customTemplates ?? []);
    this.syncCables(state.cables ?? [], state);
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

  private removeDeviceEntry(id: string): void {
    const entry = this.deviceEntries.get(id);
    if (!entry) return;
    const group = this.rackGroups.get(entry.rackId);
    group?.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    for (const ear of entry.earMeshes) {
      group?.remove(ear);
      ear.geometry.dispose();
    }
    for (const led of entry.ledMeshes) {
      group?.remove(led);
      led.geometry.dispose();
    }
    for (const port of entry.portMeshes) {
      group?.remove(port);
      port.geometry.dispose();
    }
    this.deviceEntries.delete(id);
  }

  private syncDevices(racks: RackData[], devices: DeviceData[], customTemplates: DeviceTemplate[]): void {
    const incoming = new Set(devices.map(d => d.id));

    // Remove deleted devices
    for (const id of [...this.deviceEntries.keys()]) {
      if (!incoming.has(id)) this.removeDeviceEntry(id);
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
      const newHash = geometryHash(device, template);
      const existing = this.deviceEntries.get(device.id);

      if (existing && existing.geometryHash === newHash) {
        // Only position changed — update Y on mesh and ears
        existing.mesh.position.set(0, deviceY, 0);
        for (const ear of existing.earMeshes) {
          ear.position.setY(deviceY);
        }
        // Refresh SVG texture if port connectivity changed (no geometry rebuild needed)
        if (!device.frontPanelImage && !template.frontPanelImage) {
          getDeviceFrontMaterial(device, template);
        }
      } else {
        // Geometry or texture changed (or new device) — rebuild mesh
        if (existing) this.removeDeviceEntry(device.id);
        const { mesh, earMeshes, ledMeshes, portMeshes } = buildDeviceMesh(device, template, rack, this.materials);
        rackGroup.add(mesh);
        for (const ear of earMeshes) rackGroup.add(ear);
        for (const led of ledMeshes) rackGroup.add(led);
        for (const port of portMeshes) rackGroup.add(port);
        this.deviceEntries.set(device.id, { mesh, earMeshes, ledMeshes, portMeshes, rackId: device.rackId, geometryHash: newHash });
      }
    }
  }

  private syncCables(cables: CableData[], state: AppState): void {
    const incoming = new Set(cables.map(c => c.id));

    // Remove deleted cables
    for (const [id, mesh] of this.cableMeshes) {
      if (!incoming.has(id)) {
        this.scene.remove(mesh);
        (mesh as THREE.Mesh).geometry?.dispose();
        this.cableMeshes.delete(id);
      }
    }

    // Rebuild all cables (cable endpoints depend on device positions — always re-evaluate)
    for (const cable of cables) {
      const existing = this.cableMeshes.get(cable.id);
      if (existing) {
        this.scene.remove(existing);
        (existing as THREE.Mesh).geometry?.dispose();
        this.cableMeshes.delete(cable.id);
      }
      const mesh = buildCableMesh(cable, state);
      if (mesh) {
        this.scene.add(mesh);
        this.cableMeshes.set(cable.id, mesh);
      }
    }
  }

  setDoorState(state: DoorState): void {
    const visible = state !== 'removed';
    this.doorTargetAngle = state === 'open' ? Math.PI * 0.7 : 0;
    for (const group of this.rackGroups.values()) {
      const door = group.children.find(c => c.name === 'rack-door');
      if (door) {
        door.visible = visible;
        // Snap when removing/restoring; animate open/close
        if (!visible || state === 'closed') door.rotation.y = this.doorTargetAngle;
      }
    }
  }

  tick(time: number): void {
    // LED pulse animation
    for (const entry of this.deviceEntries.values()) {
      for (const led of entry.ledMeshes) {
        const { minI, maxI, speed, phase } = led.userData as { minI: number; maxI: number; speed: number; phase: number };
        const t = (Math.sin(time * speed + phase) + 1) / 2;
        (led.material as THREE.MeshStandardMaterial).emissiveIntensity = minI + t * (maxI - minI);
      }
    }

    // Fan spin + door smooth animation
    for (const group of this.rackGroups.values()) {
      group.traverse((obj) => {
        if (obj.name === 'fan-blade') obj.rotation.y += 0.07;
      });

      const door = group.children.find(c => c.name === 'rack-door');
      if (door && door.visible) {
        const diff = this.doorTargetAngle - door.rotation.y;
        if (Math.abs(diff) > 0.001) door.rotation.y += diff * 0.1;
      }
    }
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    disposeSVGTextures();
    this.scene.clear();
    this.rackGroups.clear();
    this.deviceEntries.clear();
    this.cableMeshes.clear();
  }
}
