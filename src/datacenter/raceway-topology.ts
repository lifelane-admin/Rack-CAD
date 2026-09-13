import { DcInfrastructureItem, DcRacewayFittingType, DcRacewayJunctionNode, DcRack } from './types';

export interface TopologySolveOptions {
  snapRadiusM?: number;
  racks?: DcRack[];
}

/**
 * Splits intersecting raceways (T-junctions and cross intersections) into discrete continuous segments.
 * Guarantees that at every intersection, each branch terminates at the junction point.
 */
export function splitIntersectingInfraItems(items: DcInfrastructureItem[]): DcInfrastructureItem[] {
  if (!items || items.length === 0) return [];

  const byLayer = new Map<string, DcInfrastructureItem[]>();
  for (const item of items) {
    if (item.category === 'riser') {
      const l = item.layer || 'underfloor';
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(item);
      continue;
    }
    const layer = item.layer || 'underfloor';
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(item);
  }

  const result: DcInfrastructureItem[] = [];

  for (const [_, layerItems] of byLayer.entries()) {
    let currentSegments: DcInfrastructureItem[] = [...layerItems];
    let changed = true;
    let iterations = 0;

    while (changed && iterations < 15) {
      changed = false;
      iterations++;
      const nextSegments: DcInfrastructureItem[] = [];

      for (let i = 0; i < currentSegments.length; i++) {
        const segA = currentSegments[i];
        if (segA.category === 'riser') {
          nextSegments.push(segA);
          continue;
        }

        const a1 = segA.start;
        const a2 = segA.end;
        const lenA = Math.hypot(a2.x - a1.x, a2.y - a1.y);
        if (lenA < 0.05) {
          nextSegments.push(segA);
          continue;
        }

        const splitTs: number[] = [];

        for (let j = 0; j < currentSegments.length; j++) {
          if (i === j) continue;
          const segB = currentSegments[j];
          if (segB.category === 'riser') continue;
          const b1 = segB.start;
          const b2 = segB.end;

          // Case 1: Endpoint of B touches interior of A (T-junction)
          for (const pt of [b1, b2]) {
            const dx = a2.x - a1.x;
            const dy = a2.y - a1.y;
            const t = ((pt.x - a1.x) * dx + (pt.y - a1.y) * dy) / (lenA * lenA);
            if (t > 0.04 && t < 0.96) {
              const projX = a1.x + t * dx;
              const projY = a1.y + t * dy;
              const dist = Math.hypot(pt.x - projX, pt.y - projY);
              if (dist <= 0.22) {
                splitTs.push(t);
              }
            }
          }

          // Case 2: Segment A and Segment B cross each other (4-way Cross-joint)
          const x1 = a1.x, y1 = a1.y, x2 = a2.x, y2 = a2.y;
          const x3 = b1.x, y3 = b1.y, x4 = b2.x, y4 = b2.y;
          const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
          if (Math.abs(denom) > 1e-6) {
            const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
            const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
            if (ua > 0.04 && ua < 0.96 && ub > 0.04 && ub < 0.96) {
              splitTs.push(ua);
            }
          }
        }

        if (splitTs.length > 0) {
          splitTs.sort((a, b) => a - b);
          const uniqueTs: number[] = [];
          for (const t of splitTs) {
            if (uniqueTs.length === 0 || Math.abs(t - uniqueTs[uniqueTs.length - 1]) > 0.04) {
              uniqueTs.push(t);
            }
          }

          if (uniqueTs.length > 0) {
            changed = true;
            let prevT = 0;
            let prevPt = { ...a1 };

            for (let k = 0; k < uniqueTs.length; k++) {
              const t = uniqueTs[k];
              const splitPt = {
                x: parseFloat((a1.x + t * (a2.x - a1.x)).toFixed(4)),
                y: parseFloat((a1.y + t * (a2.y - a1.y)).toFixed(4)),
                z: a1.z,
              };

              nextSegments.push({
                ...segA,
                id: `${segA.id}_sub${k + 1}`,
                parentItemId: segA.parentItemId || segA.id,
                start: { ...prevPt },
                end: { ...splitPt },
              });

              prevT = t;
              prevPt = splitPt;
            }

            nextSegments.push({
              ...segA,
              id: `${segA.id}_sub${uniqueTs.length + 1}`,
              parentItemId: segA.parentItemId || segA.id,
              start: { ...prevPt },
              end: { ...a2 },
            });
            continue;
          }
        }

        nextSegments.push(segA);
      }

      currentSegments = nextSegments;
    }

    result.push(...currentSegments);
  }

  return result;
}

/**
 * Analyzes infrastructure raceway segments in a datacenter floor plan and computes
 * the exact fitting components (90° Curved Elbows, T-Joints, Cross-Joints, Couplings,
 * Reducers, Waterfall Drops, and End Caps) for all raceway categories.
 */
export function solveRacewayTopology(
  items: DcInfrastructureItem[],
  options: TopologySolveOptions = {}
): DcRacewayJunctionNode[] {
  const snapRadius = options.snapRadiusM ?? 0.22; // 220mm snap tolerance
  const racks = options.racks ?? [];
  const nodes: DcRacewayJunctionNode[] = [];

  if (!items || items.length === 0) return nodes;

  const splitItems = splitIntersectingInfraItems(items);

  // Group items by layer (underfloor vs overhead vs ceiling)
  const byLayer = new Map<string, DcInfrastructureItem[]>();
  for (const item of splitItems) {
    if (item.category === 'riser') continue; // risers are vertical pillars
    const layer = item.layer || 'underfloor';
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(item);
  }

  for (const [layer, layerItems] of byLayer.entries()) {
    interface EndpointRef {
      item: DcInfrastructureItem;
      isStart: boolean;
      pt: { x: number; y: number };
      otherPt: { x: number; y: number };
    }

    const endpoints: EndpointRef[] = [];
    for (const item of layerItems) {
      endpoints.push({
        item,
        isStart: true,
        pt: { x: item.start.x, y: item.start.y },
        otherPt: { x: item.end.x, y: item.end.y },
      });
      endpoints.push({
        item,
        isStart: false,
        pt: { x: item.end.x, y: item.end.y },
        otherPt: { x: item.start.x, y: item.start.y },
      });
    }

    // Cluster endpoints within snapRadius
    const visited = new Set<EndpointRef>();
    const clusters: EndpointRef[][] = [];

    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i];
      if (visited.has(ep)) continue;

      const cluster: EndpointRef[] = [ep];
      visited.add(ep);

      for (let j = i + 1; j < endpoints.length; j++) {
        const otherEp = endpoints[j];
        if (visited.has(otherEp)) continue;

        const inCluster = cluster.some(c => Math.hypot(c.pt.x - otherEp.pt.x, c.pt.y - otherEp.pt.y) <= snapRadius);
        if (inCluster) {
          cluster.push(otherEp);
          visited.add(otherEp);
        }
      }

      clusters.push(cluster);
    }

    // Analyze each cluster to determine fitting type, geometry, and angles
    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
      const cluster = clusters[cIdx];
      
      const avgX = cluster.reduce((sum, ep) => sum + ep.pt.x, 0) / cluster.length;
      const avgY = cluster.reduce((sum, ep) => sum + ep.pt.y, 0) / cluster.length;

      interface BranchInfo {
        item: DcInfrastructureItem;
        angleRad: number; // 0 to 2PI
        dx: number;
        dy: number;
      }

      const branches: BranchInfo[] = [];
      const seenItemIds = new Set<string>();

      for (const ep of cluster) {
        if (seenItemIds.has(ep.item.id)) continue;
        seenItemIds.add(ep.item.id);

        const dx = ep.otherPt.x - ep.pt.x;
        const dy = ep.otherPt.y - ep.pt.y;
        const len = Math.hypot(dx, dy) || 1;
        let angle = Math.atan2(dy / len, dx / len);
        if (angle < 0) angle += Math.PI * 2;

        branches.push({ item: ep.item, angleRad: angle, dx: dx / len, dy: dy / len });
      }

      branches.sort((a, b) => a.angleRad - b.angleRad);

      const connectedInfraIds = branches.map(b => b.item.id);
      const primaryItem = branches[0]?.item || cluster[0].item;
      const category = primaryItem.category;
      const subtype = primaryItem.subtype || (category === 'cable-duct' ? 'pvc-duct' : 'basket-tray');
      const widthMm = Math.max(...cluster.map(ep => ep.item.widthMm || 300));
      const heightMm = Math.max(...cluster.map(ep => ep.item.heightMm || 80));
      const elevationMm = primaryItem.elevationMm;
      const color = primaryItem.color;

      const angles = branches.map(b => b.angleRad);
      let fittingType: DcRacewayFittingType = 'straight';
      let rackId: string | undefined;

      let rotationY = 0;
      let branchAngle: number | undefined;
      const branchCount = branches.length;

      if (branchCount === 1) {
        const nearRack = racks.find(r => {
          const rW = r.widthMm / 1000;
          const rD = r.depthMm / 1000;
          return avgX >= r.position.x - 0.2 && avgX <= r.position.x + rW + 0.2 &&
                 avgY >= r.position.y - 0.2 && avgY <= r.position.y + rD + 0.2;
        });

        if (nearRack && (layer === 'overhead' || layer === 'ceiling')) {
          fittingType = 'waterfall-outlet';
          rackId = nearRack.id;
          rotationY = branches[0].angleRad;
        } else {
          continue; // Open end of raceway does not need any blocker fitting
        }
      } else if (branchCount === 2) {
        const a1 = branches[0].angleRad;
        const a2 = branches[1].angleRad;
        let diff = Math.abs(a1 - a2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;

        const w1 = branches[0].item.widthMm || 300;
        const w2 = branches[1].item.widthMm || 300;
        const hasWidthMismatch = Math.abs(w1 - w2) >= 50;

        const diffDeg = (diff * 180) / Math.PI;

        if (diffDeg >= 145) {
          fittingType = hasWidthMismatch ? 'reducing-coupling' : 'coupling';
          rotationY = a1;
        } else if (diffDeg >= 65 && diffDeg <= 115) {
          fittingType = 'elbow-90';
          const midDx = Math.cos(a1) + Math.cos(a2);
          const midDy = Math.sin(a1) + Math.sin(a2);
          rotationY = Math.atan2(midDy, midDx);
        } else if (diffDeg >= 30 && diffDeg < 65) {
          fittingType = 'elbow-45';
          const midDx = Math.cos(a1) + Math.cos(a2);
          const midDy = Math.sin(a1) + Math.sin(a2);
          rotationY = Math.atan2(midDy, midDx);
        } else if (diffDeg > 115 && diffDeg < 145) {
          fittingType = 'elbow-45';
          const midDx = Math.cos(a1) + Math.cos(a2);
          const midDy = Math.sin(a1) + Math.sin(a2);
          rotationY = Math.atan2(midDy, midDx);
        } else {
          fittingType = 'elbow-90';
          const midDx = Math.cos(a1) + Math.cos(a2);
          const midDy = Math.sin(a1) + Math.sin(a2);
          rotationY = Math.atan2(midDy, midDx);
        }
      } else if (branchCount === 3) {
        fittingType = 'tee-joint';
        let maxOppScore = -1;
        let mainPair = [0, 1];
        for (let i = 0; i < 3; i++) {
          for (let j = i + 1; j < 3; j++) {
            let d = Math.abs(branches[i].angleRad - branches[j].angleRad);
            if (d > Math.PI) d = Math.PI * 2 - d;
            if (d > maxOppScore) {
              maxOppScore = d;
              mainPair = [i, j];
            }
          }
        }
        const sideIdx = [0, 1, 2].find(idx => !mainPair.includes(idx)) ?? 2;
        branchAngle = branches[sideIdx].angleRad;
        rotationY = branchAngle;
      } else if (branchCount >= 4) {
        fittingType = 'cross-joint';
        rotationY = branches[0].angleRad;
      }

      nodes.push({
        id: `node-${layer}-${cIdx + 1}-${Math.round(avgX * 100)}_${Math.round(avgY * 100)}`,
        x: parseFloat(avgX.toFixed(3)),
        y: parseFloat(avgY.toFixed(3)),
        elevationMm,
        layer: layer as any,
        fittingType,
        category,
        subtype,
        widthMm,
        heightMm,
        angles,
        connectedInfraIds,
        rackId,
        color,
        rotationY,
        branchAngle,
        branchVectors: branches.map(b => ({ x: b.dx, z: b.dy })),
      });
    }
  }

  return nodes;
}

export interface TruncatedInfraSegment {
  originalItem: DcInfrastructureItem;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  lengthMm: number;
  midX: number;
  midZ: number;
  angleY: number;
  cutbackStartMm: number;
  cutbackEndMm: number;
}

export function getTruncatedInfraSegments(
  items: DcInfrastructureItem[],
  junctionNodes: DcRacewayJunctionNode[],
  snapRadiusM = 0.22
): TruncatedInfraSegment[] {
  const splitItems = splitIntersectingInfraItems(items);

  return splitItems.map(item => {
    let sX = item.start.x;
    let sY = item.start.y;
    let eX = item.end.x;
    let eY = item.end.y;

    const dx = eX - sX;
    const dy = eY - sY;
    const fullLenM = Math.hypot(dx, dy);
    if (fullLenM < 0.001) {
      return {
        originalItem: item,
        start: { ...item.start },
        end: { ...item.end },
        lengthMm: 100,
        midX: sX * 1000,
        midZ: sY * 1000,
        angleY: 0,
        cutbackStartMm: 0,
        cutbackEndMm: 0,
      };
    }

    const dirX = dx / fullLenM;
    const dirY = dy / fullLenM;

    let cutbackStartM = 0;
    let cutbackEndM = 0;

    const getCutback = (node: DcRacewayJunctionNode) => {
      if (node.fittingType === 'elbow-90' || node.fittingType === 'elbow-45') {
        const rIn = Math.max(30, node.widthMm * 0.4);
        return (rIn + node.widthMm / 2) / 1000;
      }
      return (node.widthMm * 0.75) / 1000;
    };

    // Check start connection
    const nodeStart = junctionNodes.find(n =>
      n.layer === item.layer &&
      Math.hypot(n.x - sX, n.y - sY) <= snapRadiusM &&
      n.connectedInfraIds.includes(item.id)
    );
    if (nodeStart && nodeStart.fittingType !== 'straight') {
      cutbackStartM = Math.min(fullLenM * 0.45, getCutback(nodeStart));
    }

    // Check end connection
    const nodeEnd = junctionNodes.find(n =>
      n.layer === item.layer &&
      Math.hypot(n.x - eX, n.y - eY) <= snapRadiusM &&
      n.connectedInfraIds.includes(item.id)
    );
    if (nodeEnd && nodeEnd.fittingType !== 'straight') {
      cutbackEndM = Math.min(fullLenM * 0.45, getCutback(nodeEnd));
    }

    // Apply cutback if sufficient length
    if (fullLenM > (cutbackStartM + cutbackEndM + 0.05)) {
      sX += dirX * cutbackStartM;
      sY += dirY * cutbackStartM;
      eX -= dirX * cutbackEndM;
      eY -= dirY * cutbackEndM;
    }

    const truncLenM = Math.hypot(eX - sX, eY - sY);
    const lengthMm = truncLenM * 1000;
    const midX = ((sX + eX) / 2) * 1000;
    const midZ = ((sY + eY) / 2) * 1000;
    const angleY = Math.atan2((eX - sX) * 1000, (eY - sY) * 1000);

    return {
      originalItem: item,
      start: { x: sX, y: sY, z: item.start.z },
      end: { x: eX, y: eY, z: item.end.z },
      lengthMm,
      midX,
      midZ,
      angleY,
      cutbackStartMm: cutbackStartM * 1000,
      cutbackEndMm: cutbackEndM * 1000,
    };
  });
}

export function getRacewayTheme(category: string, subtype: string) {
  const sub = (subtype || '').toLowerCase();
  const cat = (category || '').toLowerCase();

  if (sub === 'fiber-raceway' || cat === 'fiber-raceway') {
    return {
      name: 'Yellow Fiber Raceway',
      color2D: '#eab308',
      fill2D: 'rgba(234, 179, 8, 0.40)',
      accentColor: '#facc15',
      color3D: 0xfacc15,
      roughness: 0.35,
      metalness: 0.15,
      style: 'fiber-raceway',
      hasBolts: false,
      hasSideRibs: true,
    };
  }

  if (sub === 'basket-tray') {
    return {
      name: 'Wire Mesh Basket Tray',
      color2D: '#f59e0b',
      fill2D: 'rgba(245, 158, 11, 0.30)',
      accentColor: '#fbbf24',
      color3D: 0xa1a1aa,
      roughness: 0.25,
      metalness: 0.90,
      style: 'wire-mesh',
      hasBolts: true,
      hasSideRibs: false,
    };
  }

  if (sub === 'ladder-rack') {
    return {
      name: 'Ladder Cable Runway',
      color2D: '#334155',
      fill2D: 'rgba(51, 65, 85, 0.40)',
      accentColor: '#64748b',
      color3D: 0x1e293b,
      roughness: 0.35,
      metalness: 0.80,
      style: 'ladder-rack',
      hasBolts: true,
      hasSideRibs: false,
    };
  }

  if (sub === 'solid-duct') {
    return {
      name: 'Solid Galvanized Steel Duct',
      color2D: '#64748b',
      fill2D: 'rgba(100, 116, 139, 0.45)',
      accentColor: '#94a3b8',
      color3D: 0x94a3b8,
      roughness: 0.30,
      metalness: 0.85,
      style: 'solid-duct',
      hasBolts: true,
      hasSideRibs: true,
    };
  }

  if (sub === 'pvc-duct') {
    return {
      name: 'PVC Solid Duct',
      color2D: '#94a3b8',
      fill2D: 'rgba(203, 213, 225, 0.40)',
      accentColor: '#cbd5e1',
      color3D: 0xd1d5db,
      roughness: 0.45,
      metalness: 0.05,
      style: 'pvc-duct',
      hasBolts: false,
      hasSideRibs: false,
    };
  }

  if (sub === 'busway' || sub === 'power-busway' || cat === 'busway' || cat === 'power-cable') {
    return {
      name: 'Power Busway Bar',
      color2D: '#ef4444',
      fill2D: 'rgba(239, 68, 68, 0.35)',
      accentColor: '#f87171',
      color3D: 0xdc2626,
      roughness: 0.35,
      metalness: 0.60,
      style: 'busway',
      hasBolts: true,
      hasSideRibs: true,
    };
  }

  if (sub === 'conduit' || cat === 'conduit') {
    return {
      name: 'EMT Metallic Conduit',
      color2D: '#a1a1aa',
      fill2D: 'rgba(161, 161, 170, 0.35)',
      accentColor: '#d4d4d8',
      color3D: 0xa1a1aa,
      roughness: 0.20,
      metalness: 0.95,
      style: 'conduit',
      hasBolts: false,
      hasSideRibs: false,
    };
  }

  if (cat === 'cable-tray') {
    return {
      name: 'Wire Mesh Basket Tray',
      color2D: '#f59e0b',
      fill2D: 'rgba(245, 158, 11, 0.30)',
      accentColor: '#fbbf24',
      color3D: 0xa1a1aa,
      roughness: 0.25,
      metalness: 0.90,
      style: 'wire-mesh',
      hasBolts: true,
      hasSideRibs: false,
    };
  }

  return {
    name: 'PVC Solid Duct',
    color2D: '#94a3b8',
    fill2D: 'rgba(203, 213, 225, 0.40)',
    accentColor: '#cbd5e1',
    color3D: 0xd1d5db,
    roughness: 0.45,
    metalness: 0.05,
    style: 'pvc-duct',
    hasBolts: false,
    hasSideRibs: false,
  };
}
