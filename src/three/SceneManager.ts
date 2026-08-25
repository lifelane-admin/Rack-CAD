import * as THREE from 'three';
import type { AppState, RackData, DeviceData, DeviceTemplate, CableData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import type { MaterialManager } from './MaterialManager';
import { buildRackGroup, buildShellMaterials, type RackColorKey, RACK_DEPTH } from './rack-builder';
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
    JSON.stringify(device.deviceConfig || {}),
  ].join('|');
}

export type DoorState = 'closed' | 'open' | 'removed';

export class SceneManager {
  readonly scene: THREE.Scene;
  private rackGroups = new Map<string, THREE.Group>();
  private deviceEntries = new Map<string, DeviceEntry>();
  private cableMeshes = new Map<string, THREE.Mesh | THREE.Line | THREE.Group>();
  private materials: MaterialManager;
  private doorTargetAngle = 0;  // 0 = closed, Math.PI * 0.7 = open
  private rackColor: RackColorKey = 'black';
  private panelOpacity = 1;  // 1 = fully opaque; applies to side/back panel shell materials
  constructor(materials: MaterialManager) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060809);

    // Natural 3-point lighting setup for maximum brightness and realism
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 2.2);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(1500, 2500, 1800);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.75);
    fillLight.position.set(-1800, 2000, 1500);
    this.scene.add(fillLight);
  }

  rebuild(state: AppState): void {
    this.syncRacks(state.racks);
    this.syncDevices(state.racks, state.devices, state.customTemplates ?? []);
    // Cable routing in 3D is resumed.
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
        const group = buildRackGroup(rack, this.materials, this.rackColor);
        this.applyPanelOpacity(group, this.panelOpacity);
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
        const depth = device.device3D?.depth ?? template.default3D?.depth ?? 500;
        const zOffset = RACK_DEPTH / 2 - depth / 2 + 0.4;
        existing.mesh.position.set(0, deviceY, zOffset);
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
        disposeObject3D(mesh);
        this.cableMeshes.delete(id);
      }
    }

    // Rebuild all cables (cable endpoints depend on device positions — always re-evaluate)
    for (const cable of cables) {
      const existing = this.cableMeshes.get(cable.id);
      if (existing) {
        this.scene.remove(existing);
        disposeObject3D(existing);
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

  /** Rack shell color (side panels + back panel + top cap + bottom plinth). Applies to every
   *  rack currently in the scene, and is remembered for any rack built after this call too. */
  setRackColor(colorKey: RackColorKey): void {
    this.rackColor = colorKey;
    for (const group of this.rackGroups.values()) {
      const { bodyMat, sideMat } = buildShellMaterials(colorKey);
      bodyMat.transparent = this.panelOpacity < 1;
      bodyMat.opacity = this.panelOpacity;
      sideMat.transparent = this.panelOpacity < 1;
      sideMat.opacity = this.panelOpacity;

      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        if (mesh.name === 'rack-side-L' || mesh.name === 'rack-side-R') {
          (mesh.material as THREE.Material).dispose();
          mesh.material = sideMat;
        } else if (mesh.name === 'rack-back' || mesh.name === 'rack-top' || mesh.name === 'rack-base') {
          (mesh.material as THREE.Material).dispose();
          mesh.material = bodyMat;
        }
      }
    }
  }

  /** Explicit opacity control for the outer shell (side panels + back panel) — 1 = fully opaque
   *  (default), lower values let the user see through the enclosure to inspect the interior. */
  setPanelOpacity(opacity: number): void {
    this.panelOpacity = Math.max(0, Math.min(1, opacity));
    for (const group of this.rackGroups.values()) {
      this.applyPanelOpacity(group, this.panelOpacity);
    }
  }

  private applyPanelOpacity(group: THREE.Group, opacity: number): void {
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      if (!(mesh as any).isMesh) continue;
      if (mesh.name === 'rack-side-L' || mesh.name === 'rack-side-R' || mesh.name === 'rack-back') {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.transparent = opacity < 1;
        mat.opacity = opacity;
        mat.needsUpdate = true;
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

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });
}
