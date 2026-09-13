import * as THREE from 'three';

export interface Point2D {
  x: number;
  z: number;
}

/**
 * Adds a quad (2 triangles) with guaranteed vertex winding matching the desired normal direction.
 */
function addOrientedQuad(
  positions: number[],
  _normals: number[],
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number },
  p4: { x: number; y: number; z: number },
  desiredNormal: { x: number; y: number; z: number }
) {
  const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z;
  const bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;

  const dot = nx * desiredNormal.x + ny * desiredNormal.y + nz * desiredNormal.z;
  if (dot >= 0) {
    positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    positions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
  } else {
    positions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p2.x, p2.y, p2.z);
    positions.push(p1.x, p1.y, p1.z, p4.x, p4.y, p4.z, p3.x, p3.y, p3.z);
  }
}

/**
 * Adds a triangle with guaranteed vertex winding matching the desired normal direction.
 */
function addOrientedTri(
  positions: number[],
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number },
  desiredNormal: { x: number; y: number; z: number }
) {
  const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z;
  const bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;

  const dot = nx * desiredNormal.x + ny * desiredNormal.y + nz * desiredNormal.z;
  if (dot >= 0) {
    positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  } else {
    positions.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p2.x, p2.y, p2.z);
  }
}

/**
 * Builds a 90° or 45° smooth radius curved open 'U' section raceway elbow.
 * Connects branch 1 (direction u1) to branch 2 (direction u2) with exact port alignment and 0mm gap.
 */
export function createElbowMesh(
  widthMm: number,
  heightMm: number,
  u1: Point2D,
  u2: Point2D,
  mat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const baseT = Math.max(6, widthMm * 0.03);
  const halfW = widthMm / 2;
  const hubH = heightMm;
  const segments = 24;

  // Normalize directions
  const len1 = Math.hypot(u1.x, u1.z) || 1;
  const len2 = Math.hypot(u2.x, u2.z) || 1;
  const dir1 = { x: u1.x / len1, z: u1.z / len1 };
  const dir2 = { x: u2.x / len2, z: u2.z / len2 };

  // Angle between branches
  const dot = Math.max(-1, Math.min(1, dir1.x * dir2.x + dir1.z * dir2.z));
  const angleBetween = Math.acos(dot); // theta
  if (angleBetween < 0.01 || angleBetween > Math.PI - 0.01) {
    return group;
  }

  // Bisector vector pointing between u1 and u2 (interior of the turn)
  const bisectRawX = dir1.x + dir2.x;
  const bisectRawZ = dir1.z + dir2.z;
  const bisectLen = Math.hypot(bisectRawX, bisectRawZ) || 1;
  const bisectX = bisectRawX / bisectLen;
  const bisectZ = bisectRawZ / bisectLen;

  const halfAngle = angleBetween / 2;
  const rIn = Math.max(30, widthMm * 0.4);
  const rCenter = rIn + halfW;
  const rOut = rIn + widthMm;

  // Center of curvature Q
  const dQ = rCenter / Math.sin(halfAngle);
  const Q = {
    x: bisectX * dQ,
    z: bisectZ * dQ,
  };

  const cutbackDist = rCenter; // Cutback matches getTruncatedInfraSegments
  const port1Center = { x: dir1.x * cutbackDist, z: dir1.z * cutbackDist };
  const port2Center = { x: dir2.x * cutbackDist, z: dir2.z * cutbackDist };

  // Angles around Q from center of curvature
  const a1 = Math.atan2(port1Center.z - Q.z, port1Center.x - Q.x);
  const a2 = Math.atan2(port2Center.z - Q.z, port2Center.x - Q.x);

  let diff = a2 - a1;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const innerPts: Point2D[] = [];
  const outerPts: Point2D[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ang = a1 + diff * t;
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);

    innerPts.push({ x: Q.x + cosA * rIn, z: Q.z + sinA * rIn });
    outerPts.push({ x: Q.x + cosA * rOut, z: Q.z + sinA * rOut });
  }

  const yFloor = -hubH / 2 + baseT / 2;
  const yBot = -hubH / 2;
  const yTop = hubH / 2;

  // 1. Build Floor Plate Mesh with guaranteed +Y upward normal
  const floorPos: number[] = [];
  for (let i = 0; i < segments; i++) {
    const p1In = innerPts[i];
    const p1Out = outerPts[i];
    const p2In = innerPts[i + 1];
    const p2Out = outerPts[i + 1];

    addOrientedQuad(
      floorPos,
      [],
      { x: p1In.x, y: yFloor, z: p1In.z },
      { x: p1Out.x, y: yFloor, z: p1Out.z },
      { x: p2Out.x, y: yFloor, z: p2Out.z },
      { x: p2In.x, y: yFloor, z: p2In.z },
      { x: 0, y: 1, z: 0 }
    );
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3));
  floorGeo.computeVertexNormals();
  const floorMesh = new THREE.Mesh(floorGeo, mat);
  floorMesh.userData = { isDynamic: true };
  group.add(floorMesh);

  // 2. Build Outer Curved Sidewall
  const outWallPos: number[] = [];
  for (let i = 0; i < segments; i++) {
    const p1 = outerPts[i];
    const p2 = outerPts[i + 1];
    const nx = (p1.x + p2.x) / 2 - Q.x;
    const nz = (p1.z + p2.z) / 2 - Q.z;

    addOrientedQuad(
      outWallPos,
      [],
      { x: p1.x, y: yBot, z: p1.z },
      { x: p2.x, y: yBot, z: p2.z },
      { x: p2.x, y: yTop, z: p2.z },
      { x: p1.x, y: yTop, z: p1.z },
      { x: nx, y: 0, z: nz }
    );
  }
  const outWallGeo = new THREE.BufferGeometry();
  outWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(outWallPos, 3));
  outWallGeo.computeVertexNormals();
  const outWallMesh = new THREE.Mesh(outWallGeo, mat);
  outWallMesh.userData = { isDynamic: true };
  group.add(outWallMesh);

  // 3. Build Inner Curved Sidewall
  const inWallPos: number[] = [];
  for (let i = 0; i < segments; i++) {
    const p1 = innerPts[i];
    const p2 = innerPts[i + 1];
    const nx = -((p1.x + p2.x) / 2 - Q.x);
    const nz = -((p1.z + p2.z) / 2 - Q.z);

    addOrientedQuad(
      inWallPos,
      [],
      { x: p1.x, y: yBot, z: p1.z },
      { x: p2.x, y: yBot, z: p2.z },
      { x: p2.x, y: yTop, z: p2.z },
      { x: p1.x, y: yTop, z: p1.z },
      { x: nx, y: 0, z: nz }
    );
  }
  const inWallGeo = new THREE.BufferGeometry();
  inWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(inWallPos, 3));
  inWallGeo.computeVertexNormals();
  const inWallMesh = new THREE.Mesh(inWallGeo, mat);
  inWallMesh.userData = { isDynamic: true };
  group.add(inWallMesh);

  return group;
}

/**
 * Builds a 3-way T-Joint with smooth circular fillet corners and continuous straight back wall.
 */
export function createTeeMesh(
  widthMm: number,
  heightMm: number,
  branches: Point2D[],
  mat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const halfW = widthMm / 2;
  const hubH = heightMm;
  const baseT = Math.max(6, widthMm * 0.03);
  const cutbackDist = widthMm * 0.75;
  const filletR = cutbackDist - halfW; // Radius connecting port edge to branch edge

  // Determine the straight pass-through run and the perpendicular side branch
  let minDot = 1;
  let runPair = [0, 1];
  if (branches.length >= 2) {
    for (let i = 0; i < branches.length; i++) {
      for (let j = i + 1; j < branches.length; j++) {
        const dot = branches[i].x * branches[j].x + branches[i].z * branches[j].z;
        if (dot < minDot) {
          minDot = dot;
          runPair = [i, j];
        }
      }
    }
  }

  const sideIdx = [0, 1, 2].find(idx => !runPair.includes(idx)) ?? 2;
  const sideDir = branches[sideIdx] || { x: 0, z: 1 };
  const sLen = Math.hypot(sideDir.x, sideDir.z) || 1;
  const sX = sideDir.x / sLen;
  const sZ = sideDir.z / sLen;

  const runDir = branches[runPair[0]] || { x: -sZ, z: sX };
  const rLen = Math.hypot(runDir.x, runDir.z) || 1;
  const rX = runDir.x / rLen;
  const rZ = runDir.z / rLen;

  const yFloor = -hubH / 2 + baseT / 2;
  const yBot = -hubH / 2;
  const yTop = hubH / 2;

  // 1. Floor Plate (T-shape + 2 fillet corners) with guaranteed +Y upward normal
  const floorPos: number[] = [];

  // Main pass-through rectangular floor
  const m1 = { x: rX * cutbackDist - sX * halfW, y: yFloor, z: rZ * cutbackDist - sZ * halfW };
  const m2 = { x: rX * cutbackDist + sX * halfW, y: yFloor, z: rZ * cutbackDist + sZ * halfW };
  const m3 = { x: -rX * cutbackDist + sX * halfW, y: yFloor, z: -rZ * cutbackDist + sZ * halfW };
  const m4 = { x: -rX * cutbackDist - sX * halfW, y: yFloor, z: -rZ * cutbackDist - sZ * halfW };
  addOrientedQuad(floorPos, [], m1, m2, m3, m4, { x: 0, y: 1, z: 0 });

  // Side branch extension floor
  const b1 = { x: rX * halfW + sX * halfW, y: yFloor, z: rZ * halfW + sZ * halfW };
  const b2 = { x: rX * halfW + sX * cutbackDist, y: yFloor, z: rZ * halfW + sZ * cutbackDist };
  const b3 = { x: -rX * halfW + sX * cutbackDist, y: yFloor, z: -rZ * halfW + sZ * cutbackDist };
  const b4 = { x: -rX * halfW + sX * halfW, y: yFloor, z: -rZ * halfW + sZ * halfW };
  addOrientedQuad(floorPos, [], b1, b2, b3, b4, { x: 0, y: 1, z: 0 });

  // Two Fillet Corner Arcs
  const cornerWallPos: number[] = [];
  const addCorner = (signR: number) => {
    const Q = {
      x: signR * rX * cutbackDist + sX * cutbackDist,
      z: signR * rZ * cutbackDist + sZ * cutbackDist,
    };
    const pPortRun = {
      x: signR * rX * cutbackDist + sX * halfW,
      z: signR * rZ * cutbackDist + sZ * halfW,
    };
    const pPortSide = {
      x: signR * rX * halfW + sX * cutbackDist,
      z: signR * rZ * halfW + sZ * cutbackDist,
    };

    const aStart = Math.atan2(pPortRun.z - Q.z, pPortRun.x - Q.x);
    let aEnd = Math.atan2(pPortSide.z - Q.z, pPortSide.x - Q.x);
    let diff = aEnd - aStart;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const arcPts: Point2D[] = [];
    const segs = 12;
    for (let k = 0; k <= segs; k++) {
      const ang = aStart + diff * (k / segs);
      arcPts.push({
        x: Q.x + Math.cos(ang) * filletR,
        z: Q.z + Math.sin(ang) * filletR,
      });
    }

    // Corner Floor sector
    const cornerOrigin = { x: signR * rX * halfW + sX * halfW, y: yFloor, z: signR * rZ * halfW + sZ * halfW };
    for (let k = 0; k < segs; k++) {
      const pA = { x: arcPts[k].x, y: yFloor, z: arcPts[k].z };
      const pB = { x: arcPts[k + 1].x, y: yFloor, z: arcPts[k + 1].z };
      addOrientedTri(floorPos, cornerOrigin, pA, pB, { x: 0, y: 1, z: 0 });
    }

    // Corner Fillet Vertical Wall
    for (let k = 0; k < segs; k++) {
      const pA = arcPts[k];
      const pB = arcPts[k + 1];
      const nx = -(pA.x - Q.x);
      const nz = -(pA.z - Q.z);

      addOrientedQuad(
        cornerWallPos,
        [],
        { x: pA.x, y: yBot, z: pA.z },
        { x: pB.x, y: yBot, z: pB.z },
        { x: pB.x, y: yTop, z: pB.z },
        { x: pA.x, y: yTop, z: pA.z },
        { x: nx, y: 0, z: nz }
      );
    }
  };

  addCorner(1);
  addCorner(-1);

  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3));
  floorGeo.computeVertexNormals();
  const floorMesh = new THREE.Mesh(floorGeo, mat);
  floorMesh.userData = { isDynamic: true };
  group.add(floorMesh);

  if (cornerWallPos.length > 0) {
    const cWallGeo = new THREE.BufferGeometry();
    cWallGeo.setAttribute('position', new THREE.Float32BufferAttribute(cornerWallPos, 3));
    cWallGeo.computeVertexNormals();
    const cWallMesh = new THREE.Mesh(cWallGeo, mat);
    cWallMesh.userData = { isDynamic: true };
    group.add(cWallMesh);
  }

  // 2. Straight Back Wall
  const bwPos: number[] = [];
  const bw1 = { x: -rX * cutbackDist - sX * halfW, z: -rZ * cutbackDist - sZ * halfW };
  const bw2 = { x: rX * cutbackDist - sX * halfW, z: rZ * cutbackDist - sZ * halfW };
  addOrientedQuad(
    bwPos,
    [],
    { x: bw1.x, y: yBot, z: bw1.z },
    { x: bw2.x, y: yBot, z: bw2.z },
    { x: bw2.x, y: yTop, z: bw2.z },
    { x: bw1.x, y: yTop, z: bw1.z },
    { x: sX, y: 0, z: sZ }
  );
  const bwGeo = new THREE.BufferGeometry();
  bwGeo.setAttribute('position', new THREE.Float32BufferAttribute(bwPos, 3));
  bwGeo.computeVertexNormals();
  const bwMesh = new THREE.Mesh(bwGeo, mat);
  bwMesh.userData = { isDynamic: true };
  group.add(bwMesh);

  return group;
}

/**
 * Builds a 4-way Cross Joint with 4 quadrant curved fillet walls and completely open passages.
 */
export function createCrossMesh(
  widthMm: number,
  heightMm: number,
  mat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const baseT = Math.max(6, widthMm * 0.03);
  const halfW = widthMm / 2;
  const hubH = heightMm;
  const cutbackDist = widthMm * 0.75;
  const filletR = cutbackDist - halfW;

  const yFloor = -hubH / 2 + baseT / 2;
  const yBot = -hubH / 2;
  const yTop = hubH / 2;

  const floorPos: number[] = [];

  // Cross horizontal strip (X axis)
  addOrientedQuad(
    floorPos,
    [],
    { x: -cutbackDist, y: yFloor, z: -halfW },
    { x: cutbackDist, y: yFloor, z: -halfW },
    { x: cutbackDist, y: yFloor, z: halfW },
    { x: -cutbackDist, y: yFloor, z: halfW },
    { x: 0, y: 1, z: 0 }
  );

  // Cross vertical top/bottom strips (Z axis)
  addOrientedQuad(
    floorPos,
    [],
    { x: -halfW, y: yFloor, z: halfW },
    { x: halfW, y: yFloor, z: halfW },
    { x: halfW, y: yFloor, z: cutbackDist },
    { x: -halfW, y: yFloor, z: cutbackDist },
    { x: 0, y: 1, z: 0 }
  );
  addOrientedQuad(
    floorPos,
    [],
    { x: -halfW, y: yFloor, z: -cutbackDist },
    { x: halfW, y: yFloor, z: -cutbackDist },
    { x: halfW, y: yFloor, z: -halfW },
    { x: -halfW, y: yFloor, z: -halfW },
    { x: 0, y: 1, z: 0 }
  );

  // 4 Quadrant Fillets
  const signs = [
    { sx: 1, sz: 1 },
    { sx: -1, sz: 1 },
    { sx: -1, sz: -1 },
    { sx: 1, sz: -1 },
  ];

  const wallPos: number[] = [];

  for (const { sx, sz } of signs) {
    const Q = { x: sx * cutbackDist, z: sz * cutbackDist };
    const pX = { x: sx * cutbackDist, z: sz * halfW };
    const pZ = { x: sx * halfW, z: sz * cutbackDist };

    const aStart = Math.atan2(pX.z - Q.z, pX.x - Q.x);
    let aEnd = Math.atan2(pZ.z - Q.z, pZ.x - Q.x);
    let diff = aEnd - aStart;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const arcPts: Point2D[] = [];
    const segs = 12;
    for (let k = 0; k <= segs; k++) {
      const ang = aStart + diff * (k / segs);
      arcPts.push({ x: Q.x + Math.cos(ang) * filletR, z: Q.z + Math.sin(ang) * filletR });
    }

    const cOrigin = { x: sx * halfW, y: yFloor, z: sz * halfW };
    for (let k = 0; k < segs; k++) {
      const pA = { x: arcPts[k].x, y: yFloor, z: arcPts[k].z };
      const pB = { x: arcPts[k + 1].x, y: yFloor, z: arcPts[k + 1].z };
      addOrientedTri(floorPos, cOrigin, pA, pB, { x: 0, y: 1, z: 0 });
    }

    // Fillet wall
    for (let k = 0; k < segs; k++) {
      const pA = arcPts[k];
      const pB = arcPts[k + 1];
      const nx = -(pA.x - Q.x);
      const nz = -(pA.z - Q.z);

      addOrientedQuad(
        wallPos,
        [],
        { x: pA.x, y: yBot, z: pA.z },
        { x: pB.x, y: yBot, z: pB.z },
        { x: pB.x, y: yTop, z: pB.z },
        { x: pA.x, y: yTop, z: pA.z },
        { x: nx, y: 0, z: nz }
      );
    }
  }

  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(floorPos, 3));
  floorGeo.computeVertexNormals();
  const floorMesh = new THREE.Mesh(floorGeo, mat);
  floorMesh.userData = { isDynamic: true };
  group.add(floorMesh);

  if (wallPos.length > 0) {
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    wallGeo.computeVertexNormals();
    const wallMesh = new THREE.Mesh(wallGeo, mat);
    wallMesh.userData = { isDynamic: true };
    group.add(wallMesh);
  }

  return group;
}

/**
 * Builds a straight Coupling assembly sleeve wrapping around the joint seam.
 */
export function createCouplingMesh(
  widthMm: number,
  heightMm: number,
  direction: Point2D | undefined,
  mat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const hubH = heightMm;
  const cW = widthMm + 12;
  const cH = hubH + 4;
  const cLen = 70;

  const baseGeo = new THREE.BoxGeometry(cW, 6, cLen);
  const baseMesh = new THREE.Mesh(baseGeo, mat);
  baseMesh.position.set(0, -hubH / 2 - 3, 0);
  baseMesh.userData = { isDynamic: true };
  group.add(baseMesh);

  const earGeo = new THREE.BoxGeometry(6, cH, cLen);
  const earL = new THREE.Mesh(earGeo, mat);
  earL.position.set(-cW / 2 + 3, 0, 0);
  earL.userData = { isDynamic: true };
  group.add(earL);

  const earR = new THREE.Mesh(earGeo, mat);
  earR.position.set(cW / 2 - 3, 0, 0);
  earR.userData = { isDynamic: true };
  group.add(earR);

  if (direction) {
    const dirAngle = Math.atan2(direction.x, direction.z);
    group.rotation.y = dirAngle;
  }

  return group;
}

