export type ZOrderDirection = 'front' | 'forward' | 'backward' | 'back';

/** Reorders one array-of-objects-with-id entry relative to its own siblings — backs every cloud
 *  canvas object's "Visual Order" context-menu action (Bring to Front/Forward, Send Backward/to
 *  Back). Scoped to whichever state array the object lives in (cloudNodes/cloudContainers/
 *  cloudHierarchies/cloudConnectors) rather than one global z-index: each type already renders
 *  into its own fixed SVG layer (containers < hierarchies < nodes < connectors, see
 *  cloud-canvas.ts), so a node can never actually go "behind" a container — this only reorders
 *  same-type siblings, which is the only order that's ever visually ambiguous (e.g. which of two
 *  overlapping containers is on top). Later array position = rendered later = visually on top
 *  (see renderCloudAll()'s per-array for-loops), so this is a pure array reorder, not a stored
 *  z-index number. */
export function reorderById<T extends { id: string }>(arr: T[], id: string, direction: ZOrderDirection): T[] {
  const idx = arr.findIndex(item => item.id === id);
  if (idx === -1) return arr;
  const copy = arr.slice();
  const [item] = copy.splice(idx, 1);
  switch (direction) {
    case 'back':
      copy.unshift(item);
      break;
    case 'front':
      copy.push(item);
      break;
    case 'backward':
      copy.splice(Math.max(0, idx - 1), 0, item);
      break;
    case 'forward':
      copy.splice(Math.min(copy.length, idx + 1), 0, item);
      break;
  }
  return copy;
}
