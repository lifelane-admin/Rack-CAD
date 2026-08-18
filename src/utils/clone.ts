import { DeviceData, RackData, TextLabel, ImageAsset, CloudNode, CloudContainer, CloudHierarchy, CloudConnector, Point } from '../core/types';
import { generateId } from './geometry';

/** How far a duplicate (copy/paste, Ctrl+D, or Ctrl+Drag-clone) is offset from its source, in
 *  world units — small enough to stay visibly adjacent, large enough that the two don't
 *  perfectly overlap and read as a single object. Shared by every clone helper below except
 *  cloneDevice (rack-unit position, not a free x/y one) and cloneCloudConnector (its own offset,
 *  see that function's doc comment). */
const CLONE_OFFSET = 24;

/** Duplicates an empty rack shell at an offset position — deliberately does NOT bring along the
 *  original's devices (a "duplicate this rack" isn't "duplicate everything mounted in it", which
 *  would also require cloning cables/ports and deciding how they're allowed to cross racks) or
 *  PDU/circuit references, which point at devices that stay behind in the original rack. */
export function cloneRack(rack: RackData): RackData {
  return {
    id: generateId(),
    name: rack.name + ' Copy',
    units: rack.units,
    x: rack.x + CLONE_OFFSET,
    y: rack.y + CLONE_OFFSET,
  };
}

export function cloneTextLabel(label: TextLabel): TextLabel {
  return { ...label, id: generateId(), x: label.x + CLONE_OFFSET, y: label.y + CLONE_OFFSET, locked: false };
}

export function cloneImageAsset(asset: ImageAsset): ImageAsset {
  return { ...asset, id: generateId(), x: asset.x + CLONE_OFFSET, y: asset.y + CLONE_OFFSET, locked: false };
}

export function cloneCloudNode(node: CloudNode): CloudNode {
  return { ...node, id: generateId(), x: node.x + CLONE_OFFSET, y: node.y + CLONE_OFFSET, locked: false };
}

export function cloneCloudContainer(container: CloudContainer): CloudContainer {
  return { ...container, id: generateId(), x: container.x + CLONE_OFFSET, y: container.y + CLONE_OFFSET, locked: false };
}

export function cloneCloudHierarchy(hierarchy: CloudHierarchy): CloudHierarchy {
  return {
    ...hierarchy,
    id: generateId(),
    x: hierarchy.x + CLONE_OFFSET,
    y: hierarchy.y + CLONE_OFFSET,
    levels: hierarchy.levels.map(l => ({ ...l })),
    locked: false,
  };
}

export function cloneDevice(device: DeviceData): DeviceData {
  const newId = crypto.randomUUID();
  return {
    ...device,
    id: newId,
    hostname: device.hostname + '-copy',
    locked: false,
    ports: device.ports.map(p => ({
      ...p,
      id: crypto.randomUUID(),
      deviceId: newId,
      connected: false,
      cableId: null,
    })),
  };
}

/** Clones a CloudConnector as a fully detached copy — both ends become floating points near the
 *  original's current resolved position (offset so the two lines are visibly distinguishable,
 *  same idea as a shape-duplicate's position nudge in draw.io/Lucidchart/Visio) rather than
 *  re-attaching to the same two nodes. Reattaching would either perfectly overlap the original
 *  (invisible copy) or need the manual route overrides — crossbarOffset/entryOffset/etc., all
 *  absolute world coordinates tuned for the ORIGINAL endpoints — recalculated for a different
 *  pair of points, which isn't generally possible; clearing them and starting from a clean
 *  auto-route (once the user drags each end onto wherever they want) is simpler and predictable. */
export function cloneCloudConnector(connector: CloudConnector, from: Point, to: Point): CloudConnector {
  const offset = 20;
  return {
    ...connector,
    id: generateId(),
    sourceNodeId: null,
    sourcePoint: { x: from.x + offset, y: from.y + offset },
    sourceSide: undefined,
    destNodeId: null,
    destPoint: { x: to.x + offset, y: to.y + offset },
    destSide: undefined,
    crossbarOffset: undefined,
    entryOffset: undefined,
    exitOffset: undefined,
    entryStubOffset: undefined,
    exitStubOffset: undefined,
  };
}
