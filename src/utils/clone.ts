import { DeviceData, CloudConnector, Point } from '../core/types';
import { generateId } from './geometry';

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
