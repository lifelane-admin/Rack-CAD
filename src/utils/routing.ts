import { CableData, Point, RACK_CONSTANTS } from '../core/types';
import { stateManager } from '../core/state';
import { getMaterialProfile } from '../core/cable-materials';

/**
 * ═══════════════════════════════════════════════════════════════
 *  CABLE ROUTING — passes through the physical mounting holes
 * ═══════════════════════════════════════════════════════════════
 *
 * Rack geometry (coordinates relative to rack.x / rack.y):
 *
 *   innerX     = 25   px  (= (RACK_OUTER_WIDTH - RACK_INNER_WIDTH) / 2)
 *   leftRailX  = 25   px  (= innerX)
 *   rightRailX = 400  px  (= innerX + RACK_INNER_WIDTH - RAIL_WIDTH)
 *   outerWidth = 450  px
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │25 ←left rail→ 50 ←── device body ──→ 400 ←right rail→ 425│ 0..450
 *   └───────────────────────────────────────────────────────────┘
 *
 *  RIGHT side mounting holes (from rack-renderer.ts):
 *    holeXRight = rightRailX + 6 = 406  (inner face of right rail)
 *
 *  LEFT side mounting holes:
 *    holeXLeft  = leftRailX + RAIL_WIDTH - 6 = 44  (inner face of left rail)
 *
 *  Hole Y positions per rack unit u (yOffset = innerY + innerHeight - u*RU_HEIGHT):
 *    Hole 0: yOffset + RU_HEIGHT/6      (= yOffset + 5)
 *    Hole 1: yOffset + RU_HEIGHT/2      (= yOffset + 15)  ← middle hole (used for routing)
 *    Hole 2: yOffset + 5*RU_HEIGHT/6   (= yOffset + 25)
 *
 *  Cable path:
 *    Server port ──horizontal──▶ Rail hole (x=406, y=portY)
 *        ──vertical inside rail▶ Rail hole (x=406, y=switchPortY)
 *        ──horizontal──▶ Switch port
 *
 *  Staggering: for multiple cables sharing the same side, each cable
 *  gets a slightly different X lane (406, 410, 414 ...) so they are
 *  visible as individual lines on the rail face.
 */

export function computeSmartRouting(
  cable: CableData,
  sourcePos: Point,
  destPos: Point
): Point[] {
  const s = stateManager.getState();
  const sourcePort = stateManager.getPort(cable.sourcePortId);
  const destPort   = cable.destPortId ? stateManager.getPort(cable.destPortId) : null;

  if (!sourcePort) return [sourcePos, destPos];

  const sourceDevice = stateManager.getDevice(sourcePort.deviceId);
  const destDevice   = destPort ? stateManager.getDevice(destPort.deviceId) : null;

  const sourceRack = sourceDevice ? stateManager.getRack(sourceDevice.rackId) : null;
  const destRack   = destDevice   ? stateManager.getRack(destDevice.rackId)   : null;

  // ── Geometry constants (match rack-renderer.ts exactly) ──────────────────
  const INNER_X      = (RACK_CONSTANTS.RACK_OUTER_WIDTH - RACK_CONSTANTS.RACK_INNER_WIDTH) / 2; // 25
  const RIGHT_RAIL_X = INNER_X + RACK_CONSTANTS.RACK_INNER_WIDTH - RACK_CONSTANTS.RAIL_WIDTH;   // 400
  const LEFT_RAIL_X  = INNER_X;                                                                  // 25

  // Exact hole X on inner face of each rail post (matches rack-renderer.ts lines 116-117)
  const RIGHT_HOLE_X_LOCAL = RIGHT_RAIL_X + 6;  // 406 relative to rack.x
  const LEFT_HOLE_X_LOCAL  = LEFT_RAIL_X + RACK_CONSTANTS.RAIL_WIDTH - 6; // 44 relative to rack.x

  // ── Side preference ───────────────────────────────────────────────────────
  // Server ports are at relativeX=325 (right side of 350px device body) → always right
  // Switch/management ports at lower relativeX may go left or right
  const sideSrc: 'left' | 'right' =
    cable.sidePreference ?? (sourcePort.relativeX > 175 ? 'right' : 'left');
  const sideDest: 'left' | 'right' =
    cable.sidePreference ?? (destPort ? (destPort.relativeX > 175 ? 'right' : 'left') : sideSrc);

  // ── World-space hole X ────────────────────────────────────────────────────
  const holeXSrc  = sourceRack
    ? (sideSrc  === 'right' ? sourceRack.x + RIGHT_HOLE_X_LOCAL : sourceRack.x + LEFT_HOLE_X_LOCAL)
    : sourcePos.x;

  const holeXDest = destRack
    ? (sideDest === 'right' ? destRack.x + RIGHT_HOLE_X_LOCAL   : destRack.x + LEFT_HOLE_X_LOCAL)
    : destPos.x;

  // ── Lane staggering (so parallel cables are visually distinct) ────────────
  // Cables share the same hole face but are staggered 3px apart along X.
  // Lane 0 sits exactly on the hole face; lanes 1-7 step further into the column.
  const cableIndex = s.cables.findIndex(c => c.id === cable.id);
  const lane = cableIndex >= 0 ? cableIndex % 8 : 0;
  const LANE_STEP = 3; // px

  // For right side: lanes go rightward from the hole (406, 409, 412 ...)
  // For left side: lanes go leftward from the hole (44, 41, 38 ...)
  const getLaneX = (holeX: number, side: 'left' | 'right') =>
    side === 'right' ? holeX + lane * LANE_STEP : holeX - lane * LANE_STEP;

  const laneXSrc  = getLaneX(holeXSrc,  sideSrc);
  const laneXDest = getLaneX(holeXDest, sideDest);

  // ── Anchor points ─────────────────────────────────────────────────────────
  //
  //  Path:  sourcePos ─▶ A1 ─▶ A2 ─▶ A3 ─▶ destPos
  //
  //  A1 = at the rail hole, same Y as source port  (horizontal exit)
  //  A2 = at the rail hole, same Y as dest   port  (vertical run along rail face)
  //
  //  A1 and A2 share the same X (the lane inside the hole column).
  //  The cable bends at A1, travels vertically to A2, then bends and enters dest port.

  const A1: Point = { x: laneXSrc,  y: sourcePos.y };
  const A2: Point = { x: laneXDest, y: destPos.y   };

  return [A1, A2];
}
