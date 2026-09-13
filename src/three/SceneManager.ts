import * as THREE from 'three';
import type { AppState, RackData, DeviceData, DeviceTemplate, CableData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import { stateManager } from '../core/state';
import { getTemplate } from '../library/device-catalog';
import type { MaterialManager } from './MaterialManager';
import { buildRackGroup, buildShellMaterials, type RackColorKey, RACK_DEPTH, DEVICE_FACE_Z } from './rack-builder';
import { buildDeviceMesh } from './device-builder';
import { buildCableMesh, findPort } from './cable-builder';
import { renderFrontPanel } from '../renderers/panel-renderer';
import { computePduLoad } from '../renderers/pdu-renderer';
import { getDeviceFrontMaterial, disposeSVGTextures } from './svg-texture';

const { RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM, RU_HEIGHT } = RACK_CONSTANTS;

interface DeviceEntry {
  group: THREE.Group;
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

  private hemiLight: THREE.HemisphereLight;
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private frontStudioLight: THREE.DirectionalLight;
  private backFillLight: THREE.DirectionalLight;

  constructor(materials: MaterialManager) {
    this.materials = materials;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15181f);

    // Natural studio ambient & diffuse daylight illumination
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x445566, 1.8);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(this.ambientLight);

    // Front-top natural key light
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.keyLight.position.set(800, 3000, 2500);
    this.scene.add(this.keyLight);

    // Front-left soft fill light
    this.fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.fillLight.position.set(-1800, 2000, 1800);
    this.scene.add(this.fillLight);

    // Direct front studio illumination for front face and door visibility
    this.frontStudioLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this.frontStudioLight.position.set(0, 1200, 2800);
    this.scene.add(this.frontStudioLight);

    // Soft top-rear illumination
    this.backFillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.backFillLight.position.set(0, 2500, -1800);
    this.scene.add(this.backFillLight);

    this.updateAdaptiveLighting(this.rackColor);
  }

  updateAdaptiveLighting(colorKeyOrHex: string): void {
    const isWhiteOrIvory = colorKeyOrHex === 'white' || colorKeyOrHex === 'ivory' ||
      colorKeyOrHex === '#e8e8e4' || colorKeyOrHex === '#efe7d0' || colorKeyOrHex === '#d4d4d0' || colorKeyOrHex === '#ded8c8' || colorKeyOrHex === '#dcd4c0';
    const isGrey = colorKeyOrHex === 'grey' || colorKeyOrHex === '#8a8d90' || colorKeyOrHex === '#82868a' || colorKeyOrHex === '#6e747d' || colorKeyOrHex === '#334155';

    if (isWhiteOrIvory) {
      // Lower lighting levels to prevent white/ivory materials from washing out or glowing
      this.hemiLight.intensity = 0.70;
      this.ambientLight.intensity = 0.35;
      this.keyLight.intensity = 0.50;
      this.fillLight.intensity = 0.35;
      this.frontStudioLight.intensity = 0.40;
      this.backFillLight.intensity = 0.28;
    } else if (isGrey) {
      this.hemiLight.intensity = 1.30;
      this.ambientLight.intensity = 0.70;
      this.keyLight.intensity = 0.95;
      this.fillLight.intensity = 0.70;
      this.frontStudioLight.intensity = 0.80;
      this.backFillLight.intensity = 0.55;
    } else {
      // Generous, clear brightness for Dark/Black/Obsidian cabinets so steel contours, doors and textures are crisp & visible
      this.hemiLight.intensity = 2.40;
      this.ambientLight.intensity = 1.35;
      this.keyLight.intensity = 1.80;
      this.fillLight.intensity = 1.30;
      this.frontStudioLight.intensity = 1.45;
      this.backFillLight.intensity = 1.05;
    }
  }

  rebuild(state: AppState): void {
    const racks = state.activeElevationRackId
      ? state.racks.filter(r => r.id === state.activeElevationRackId)
      : state.racks;
    const devices = state.activeElevationRackId
      ? state.devices.filter(d => d.rackId === state.activeElevationRackId)
      : state.devices;
    const rackIds = new Set(racks.map(r => r.id));
    const cables = state.activeElevationRackId
      ? (state.cables ?? []).filter(c => {
          const sp = stateManager.getPort(c.sourcePortId);
          const dp = c.destPortId ? stateManager.getPort(c.destPortId) : null;
          const sFound = findPort(c.sourcePortId, state.devices);
          const dFound = c.destPortId ? findPort(c.destPortId, state.devices) : null;
          const sDev = sp ? stateManager.getDevice(sp.deviceId) : (sFound?.device ?? null);
          const dDev = dp ? stateManager.getDevice(dp.deviceId) : (dFound?.device ?? null);
          return (sDev && rackIds.has(sDev.rackId)) || (dDev && rackIds.has(dDev.rackId)) || (!c.destPortId && sDev && rackIds.has(sDev.rackId));
        })
      : (state.cables ?? []);

    this.syncRacks(racks);
    this.syncDevices(racks, devices, state.customTemplates ?? []);
    this.syncCables(cables, state);
  }

  private syncRacks(racks: RackData[]): void {
    const incoming = new Set(racks.map(r => r.id));

    for (const [id, group] of this.rackGroups) {
      if (!incoming.has(id)) {
        this.scene.remove(group);
        disposeObject3D(group);
        this.rackGroups.delete(id);
      }
    }

    for (const rack of racks) {
      const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
      const existingGroup = this.rackGroups.get(rack.id);

      const leftPduDev = rack.leftPduId ? stateManager.getDevice(rack.leftPduId) : null;
      const rightPduDev = rack.rightPduId ? stateManager.getDevice(rack.rightPduId) : null;
      const leftWatts = leftPduDev ? computePduLoad(leftPduDev.id).watts : 0;
      const rightWatts = rightPduDev ? computePduLoad(rightPduDev.id).watts : 0;
      const leftPduHash = leftPduDev ? `${JSON.stringify(leftPduDev.deviceConfig || {})}_w:${leftWatts}` : '';
      const rightPduHash = rightPduDev ? `${JSON.stringify(rightPduDev.deviceConfig || {})}_w:${rightWatts}` : '';

      // Check if rack geometry needs rebuild (e.g. units changed, managers changed, PDUs changed, door changed, or newly added)
      const needsRebuild = !existingGroup ||
        existingGroup.userData?.units !== rack.units ||
        existingGroup.userData?.leftCableManagerWidth !== rack.leftCableManagerWidth ||
        existingGroup.userData?.rightCableManagerWidth !== rack.rightCableManagerWidth ||
        existingGroup.userData?.leftCableManagerColor !== rack.leftCableManagerColor ||
        existingGroup.userData?.rightCableManagerColor !== rack.rightCableManagerColor ||
        existingGroup.userData?.leftPduId !== rack.leftPduId ||
        existingGroup.userData?.rightPduId !== rack.rightPduId ||
        existingGroup.userData?.leftPduHash !== leftPduHash ||
        existingGroup.userData?.rightPduHash !== rightPduHash ||
        existingGroup.userData?.frontDoor !== rack.frontDoor ||
        existingGroup.userData?.sidePanels !== rack.sidePanels ||
        existingGroup.userData?.rackType !== rack.rackType ||
        existingGroup.userData?.rackColor !== rack.rackColor ||
        existingGroup.userData?.colorKey !== this.rackColor;

      if (needsRebuild) {
        if (existingGroup) {
          // Remove existing device entries attached to this rackGroup so syncDevices cleanly re-adds them
          for (const [devId, entry] of this.deviceEntries) {
            if (entry.rackId === rack.id) {
              this.removeDeviceEntry(devId);
            }
          }
          this.scene.remove(existingGroup);
          disposeObject3D(existingGroup);
          this.rackGroups.delete(rack.id);
        }

        const group = buildRackGroup(rack, this.materials, this.rackColor);
        group.userData = {
          units: rack.units,
          leftCableManagerWidth: rack.leftCableManagerWidth,
          rightCableManagerWidth: rack.rightCableManagerWidth,
          leftCableManagerColor: rack.leftCableManagerColor,
          rightCableManagerColor: rack.rightCableManagerColor,
          leftPduId: rack.leftPduId,
          rightPduId: rack.rightPduId,
          leftPduHash,
          rightPduHash,
          frontDoor: rack.frontDoor,
          sidePanels: rack.sidePanels,
          rackType: rack.rackType,
          rackColor: rack.rackColor,
          colorKey: this.rackColor
        };
        group.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
        this.applyPanelOpacity(group, this.panelOpacity);
        this.scene.add(group);
        this.rackGroups.set(rack.id, group);
      } else {
        existingGroup.position.set(rack.x + RACK_OUTER_WIDTH / 2, totalH / 2, 0);
      }
    }
  }

  private removeDeviceEntry(id: string): void {
    const entry = this.deviceEntries.get(id);
    if (!entry) return;
    const group = this.rackGroups.get(entry.rackId);
    group?.remove(entry.group);
    disposeObject3D(entry.group);
    this.deviceEntries.delete(id);
  }

  private syncDevices(racks: RackData[], devices: DeviceData[], customTemplates: DeviceTemplate[]): void {
    const incoming = new Set(devices.map(d => d.id));

    // Remove deleted devices
    for (const id of [...this.deviceEntries.keys()]) {
      if (!incoming.has(id)) this.removeDeviceEntry(id);
    }

    for (const device of devices) {
      let template = getTemplate(device.templateId, customTemplates);
      if (!template) {
        template = {
          id: device.templateId || 'fallback-device',
          name: (device as any).name || (device as any).model || 'Generic Device',
          manufacturer: '',
          model: (device as any).model || 'Generic Device',
          category: (device as any).categoryOverride || 'server',
          heightUnits: (device as any).heightUnits || 1,
          color: device.color || '#1a1e24',
          icon: '🖥️',
          powerWatts: 150,
          ports: device.ports || [],
        };
      }
      // 0U side-mount PDUs are rendered as 3D side strips directly on the rack
      if (template.mountType === 'side' || device.sideMountPosition) continue;
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
        // Only position changed — update position on the entire unified device group
        const depth = device.device3D?.depth ?? template.default3D?.depth ?? 500;
        const zOffset = DEVICE_FACE_Z - depth / 2;
        existing.group.position.set(0, deviceY, zOffset);
        // Refresh SVG texture if port connectivity changed (no geometry rebuild needed)
        if (!device.frontPanelImage && !template.frontPanelImage) {
          getDeviceFrontMaterial(device, template);
        }
      } else {
        // Geometry or texture changed (or new device) — rebuild mesh
        if (existing) this.removeDeviceEntry(device.id);
        const { group, mesh, earMeshes, ledMeshes, portMeshes } = buildDeviceMesh(device, template, rack, this.materials);
        rackGroup.add(group);
        this.deviceEntries.set(device.id, { group, mesh, earMeshes, ledMeshes, portMeshes, rackId: device.rackId, geometryHash: newHash });
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
      group.children.forEach(c => {
        if (c.name.startsWith('rack-door') || c.name === 'rack-colo-divider') {
          c.visible = visible;
          if (!visible || state === 'closed') {
            const isLeftHinge = c.name === 'rack-door-left';
            c.rotation.y = isLeftHinge ? -this.doorTargetAngle : this.doorTargetAngle;
          }
        }
      });
    }
  }

  /** Rack shell color (side panels + back panel + top cap + bottom plinth + doors). Applies to every
   *  rack currently in the scene, and is remembered for any rack built after this call too. */
  setRackColor(colorKey: RackColorKey): void {
    this.rackColor = colorKey;
    this.updateAdaptiveLighting(colorKey);

    for (const group of this.rackGroups.values()) {
      const { bodyMat, sideMat } = buildShellMaterials(colorKey);
      bodyMat.transparent = this.panelOpacity < 1;
      bodyMat.opacity = this.panelOpacity;
      sideMat.transparent = this.panelOpacity < 1;
      sideMat.opacity = this.panelOpacity;

      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.name === 'rack-side-L' || mesh.name === 'rack-side-R') {
          mesh.material = sideMat;
        } else if (
          mesh.name === 'rack-back' ||
          mesh.name === 'rack-top' ||
          mesh.name === 'rack-base' ||
          mesh.name === 'rack-front-header' ||
          mesh.name === 'rack-colo-divider' ||
          (mesh.name === 'rack-glass' && (mesh.parent?.name?.startsWith('rack-door') ?? false))
        ) {
          mesh.material = bodyMat;
        }
      });
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

      group.children.forEach(c => {
        if (c.name.startsWith('rack-door') && c.visible) {
          const target = c.name === 'rack-door-left' ? -this.doorTargetAngle : this.doorTargetAngle;
          const diff = target - c.rotation.y;
          if (Math.abs(diff) > 0.001) c.rotation.y += diff * 0.1;
        }
      });
    }
  }

  private selectionBox: THREE.BoxHelper | null = null;
  private selectionBoxGroup: THREE.Group = new THREE.Group();

  /** Updates the 3D visual selection bounding box to reflect 2D & 3D selections */
  updateSelection(selection: Array<{ type: string; id: string }>): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.geometry.dispose();
      (this.selectionBox.material as THREE.Material).dispose();
      this.selectionBox = null;
    }

    if (!selection || selection.length === 0) return;

    const primary = selection[0];
    let targetObject: THREE.Object3D | null = null;

    if (primary.type === 'device') {
      const entry = this.deviceEntries.get(primary.id);
      if (entry) targetObject = entry.group;
    } else if (primary.type === 'rack') {
      const group = this.rackGroups.get(primary.id);
      if (group) targetObject = group;
    } else if (primary.type === 'cable') {
      const cable = this.cableMeshes.get(primary.id);
      if (cable) targetObject = cable;
    }

    if (targetObject) {
      const boxColor = primary.type === 'device' ? 0x00f0ff : primary.type === 'rack' ? 0x38bdf8 : 0xffaa00;
      this.selectionBox = new THREE.BoxHelper(targetObject, boxColor);
      (this.selectionBox.material as THREE.LineBasicMaterial).linewidth = 2;
      (this.selectionBox.material as THREE.LineBasicMaterial).depthTest = false;
      this.selectionBox.renderOrder = 999;
      this.scene.add(this.selectionBox);
    }
  }

  getDeviceEntry(id: string): DeviceEntry | undefined {
    return this.deviceEntries.get(id);
  }

  getRackGroup(id: string): THREE.Group | undefined {
    return this.rackGroups.get(id);
  }

  getCableMesh(id: string): (THREE.Mesh | THREE.Line | THREE.Group) | undefined {
    return this.cableMeshes.get(id);
  }

  dispose(): void {
    if (this.selectionBox) {
      this.scene.remove(this.selectionBox);
      this.selectionBox.geometry.dispose();
      (this.selectionBox.material as THREE.Material).dispose();
      this.selectionBox = null;
    }
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
  if (!obj || typeof obj.traverse !== 'function') return;
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh && mesh.isMesh) {
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m?.dispose());
      } else {
        mesh.material?.dispose();
      }
    }
  });
}
