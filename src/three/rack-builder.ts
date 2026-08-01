import * as THREE from 'three';
import type { RackData } from '../core/types';
import { RACK_CONSTANTS } from '../core/types';
import type { MaterialManager } from './MaterialManager';

const { RU_HEIGHT, RACK_OUTER_WIDTH, RACK_INNER_WIDTH, RAIL_WIDTH, RACK_PADDING_TOP, RACK_PADDING_BOTTOM } = RACK_CONSTANTS;

export const RACK_DEPTH = 600;   // placeholder depth; Phase 3.2 makes this parametric
const POST_W = 20;

export function buildRackGroup(rack: RackData, materials: MaterialManager): THREE.Group {
  const group = new THREE.Group();
  group.name = `rack-${rack.id}`;

  const totalH = RACK_PADDING_TOP + rack.units * RU_HEIGHT + RACK_PADDING_BOTTOM;
  const frameMat = materials.get('rack-frame');
  const railMat  = materials.get('rail');

  // 4 vertical corner posts
  const postGeo = new THREE.BoxGeometry(POST_W, totalH, POST_W);
  const postOffsets: [number, number, number][] = [
    [-RACK_OUTER_WIDTH / 2 + POST_W / 2, 0, -RACK_DEPTH / 2 + POST_W / 2],
    [ RACK_OUTER_WIDTH / 2 - POST_W / 2, 0, -RACK_DEPTH / 2 + POST_W / 2],
    [-RACK_OUTER_WIDTH / 2 + POST_W / 2, 0,  RACK_DEPTH / 2 - POST_W / 2],
    [ RACK_OUTER_WIDTH / 2 - POST_W / 2, 0,  RACK_DEPTH / 2 - POST_W / 2],
  ];
  for (const [x, y, z] of postOffsets) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(x, y, z);
    group.add(post);
  }

  // Top + bottom plates
  const plateGeo = new THREE.BoxGeometry(RACK_OUTER_WIDTH, RACK_PADDING_TOP, RACK_DEPTH);
  const topPlate = new THREE.Mesh(plateGeo, frameMat);
  topPlate.position.set(0, (totalH - RACK_PADDING_TOP) / 2, 0);
  group.add(topPlate);

  // create a separate geometry so the height uses RACK_PADDING_BOTTOM, not RACK_PADDING_TOP
  const botPlateGeo = new THREE.BoxGeometry(RACK_OUTER_WIDTH, RACK_PADDING_BOTTOM, RACK_DEPTH);
  const botPlate = new THREE.Mesh(botPlateGeo, frameMat);
  botPlate.position.set(0, -(totalH - RACK_PADDING_BOTTOM) / 2, 0);
  group.add(botPlate);

  // Left + right front rails
  const railGeo = new THREE.BoxGeometry(RAIL_WIDTH, rack.units * RU_HEIGHT, RACK_DEPTH * 0.1);
  const leftRail = new THREE.Mesh(railGeo, railMat);
  leftRail.position.set(-(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2), 0, -RACK_DEPTH / 2 + RACK_DEPTH * 0.05);
  group.add(leftRail);

  const rightRail = new THREE.Mesh(railGeo.clone(), railMat);
  rightRail.position.set(RACK_INNER_WIDTH / 2 + RAIL_WIDTH / 2, 0, -RACK_DEPTH / 2 + RACK_DEPTH * 0.05);
  group.add(rightRail);

  // Inner bay volume — back-face mesh gives interior depth
  const bayMat = new THREE.MeshStandardMaterial({ color: 0x080c14, transparent: true, opacity: 0.15, side: THREE.BackSide });
  const bayGeo = new THREE.BoxGeometry(RACK_INNER_WIDTH, rack.units * RU_HEIGHT, RACK_DEPTH * 0.95);
  const bay = new THREE.Mesh(bayGeo, bayMat);
  group.add(bay);

  // World position: racks sit on the floor (y = 0).
  group.position.set(
    rack.x + RACK_OUTER_WIDTH / 2,
    totalH / 2,
    0
  );

  return group;
}
