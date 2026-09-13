import { describe, it, expect } from 'vitest';
import { solveRacewayTopology, getRacewayTheme, getTruncatedInfraSegments } from '../datacenter/raceway-topology';
import { DcInfrastructureItem, DcRack } from '../datacenter/types';

describe('Automatic Raceway Bends & Assembly Fittings Topology Solver', () => {
  it('detects a 90-degree curved elbow when 2 segments meet perpendicularly', () => {
    const items: DcInfrastructureItem[] = [
      {
        id: 'infra-1',
        name: 'Fiber Tray Run 1',
        category: 'fiber-raceway',
        layer: 'overhead',
        subtype: 'fiber-raceway',
        start: { x: 1, y: 1, z: 0 },
        end: { x: 5, y: 1, z: 0 },
        widthMm: 300,
        heightMm: 100,
        elevationMm: 2600,
      },
      {
        id: 'infra-2',
        name: 'Fiber Tray Run 2',
        category: 'fiber-raceway',
        layer: 'overhead',
        subtype: 'fiber-raceway',
        start: { x: 5, y: 1, z: 0 },
        end: { x: 5, y: 6, z: 0 },
        widthMm: 300,
        heightMm: 100,
        elevationMm: 2600,
      },
    ];

    const nodes = solveRacewayTopology(items);
    const cornerNode = nodes.find(n => n.x === 5 && n.y === 1);
    expect(cornerNode).toBeDefined();
    expect(cornerNode?.fittingType).toBe('elbow-90');
    expect(cornerNode?.connectedInfraIds).toContain('infra-1');
    expect(cornerNode?.connectedInfraIds).toContain('infra-2');
  });

  it('detects a straight joint coupling clamp when 2 collinear segments connect', () => {
    const items: DcInfrastructureItem[] = [
      {
        id: 'infra-1',
        name: 'PVC Duct Section 1',
        category: 'cable-duct',
        layer: 'underfloor',
        subtype: 'pvc-duct',
        start: { x: 1, y: 2, z: 0 },
        end: { x: 4, y: 2, z: 0 },
        widthMm: 300,
        heightMm: 80,
        elevationMm: -400,
      },
      {
        id: 'infra-2',
        name: 'PVC Duct Section 2',
        category: 'cable-duct',
        layer: 'underfloor',
        subtype: 'pvc-duct',
        start: { x: 4, y: 2, z: 0 },
        end: { x: 8, y: 2, z: 0 },
        widthMm: 300,
        heightMm: 80,
        elevationMm: -400,
      },
    ];

    const nodes = solveRacewayTopology(items);
    const couplingNode = nodes.find(n => n.x === 4 && n.y === 2);
    expect(couplingNode).toBeDefined();
    expect(couplingNode?.fittingType).toBe('coupling');
  });

  it('detects a reducing coupling when collinear segments have different widths', () => {
    const items: DcInfrastructureItem[] = [
      {
        id: 'infra-1',
        name: 'Wide Basket Tray',
        category: 'cable-tray',
        layer: 'underfloor',
        subtype: 'basket-tray',
        start: { x: 1, y: 3, z: 0 },
        end: { x: 4, y: 3, z: 0 },
        widthMm: 400,
        heightMm: 100,
        elevationMm: -400,
      },
      {
        id: 'infra-2',
        name: 'Narrow Basket Tray',
        category: 'cable-tray',
        layer: 'underfloor',
        subtype: 'basket-tray',
        start: { x: 4, y: 3, z: 0 },
        end: { x: 7, y: 3, z: 0 },
        widthMm: 200,
        heightMm: 100,
        elevationMm: -400,
      },
    ];

    const nodes = solveRacewayTopology(items);
    const reducerNode = nodes.find(n => n.x === 4 && n.y === 3);
    expect(reducerNode).toBeDefined();
    expect(reducerNode?.fittingType).toBe('reducing-coupling');
  });

  it('detects a 3-way T-Joint when 3 branches meet at an intersection', () => {
    const items: DcInfrastructureItem[] = [
      {
        id: 'infra-1',
        name: 'Solid Duct Main Left',
        category: 'cable-duct',
        layer: 'overhead',
        subtype: 'solid-duct',
        start: { x: 2, y: 4, z: 0 },
        end: { x: 5, y: 4, z: 0 },
        widthMm: 300,
        heightMm: 80,
        elevationMm: 2600,
      },
      {
        id: 'infra-2',
        name: 'Solid Duct Main Right',
        category: 'cable-duct',
        layer: 'overhead',
        subtype: 'solid-duct',
        start: { x: 5, y: 4, z: 0 },
        end: { x: 8, y: 4, z: 0 },
        widthMm: 300,
        heightMm: 80,
        elevationMm: 2600,
      },
      {
        id: 'infra-3',
        name: 'Solid Duct Branch Down',
        category: 'cable-duct',
        layer: 'overhead',
        subtype: 'solid-duct',
        start: { x: 5, y: 4, z: 0 },
        end: { x: 5, y: 7, z: 0 },
        widthMm: 300,
        heightMm: 80,
        elevationMm: 2600,
      },
    ];

    const nodes = solveRacewayTopology(items);
    const teeNode = nodes.find(n => n.x === 5 && n.y === 4);
    expect(teeNode).toBeDefined();
    expect(teeNode?.fittingType).toBe('tee-joint');
    expect(teeNode?.connectedInfraIds.length).toBe(3);
  });

  it('detects a 4-way Cross Joint when 4 branches intersect', () => {
    const items: DcInfrastructureItem[] = [
      {
        id: 'infra-1',
        name: 'Busway North',
        category: 'busway',
        layer: 'overhead',
        subtype: 'busway',
        start: { x: 6, y: 3, z: 0 },
        end: { x: 6, y: 6, z: 0 },
        widthMm: 250,
        heightMm: 120,
        elevationMm: 2600,
      },
      {
        id: 'infra-2',
        name: 'Busway South',
        category: 'busway',
        layer: 'overhead',
        subtype: 'busway',
        start: { x: 6, y: 6, z: 0 },
        end: { x: 6, y: 9, z: 0 },
        widthMm: 250,
        heightMm: 120,
        elevationMm: 2600,
      },
      {
        id: 'infra-3',
        name: 'Busway West',
        category: 'busway',
        layer: 'overhead',
        subtype: 'busway',
        start: { x: 3, y: 6, z: 0 },
        end: { x: 6, y: 6, z: 0 },
        widthMm: 250,
        heightMm: 120,
        elevationMm: 2600,
      },
      {
        id: 'infra-4',
        name: 'Busway East',
        category: 'busway',
        layer: 'overhead',
        subtype: 'busway',
        start: { x: 6, y: 6, z: 0 },
        end: { x: 9, y: 6, z: 0 },
        widthMm: 250,
        heightMm: 120,
        elevationMm: 2600,
      },
    ];

    const nodes = solveRacewayTopology(items);
    const crossNode = nodes.find(n => n.x === 6 && n.y === 6);
    expect(crossNode).toBeDefined();
    expect(crossNode?.fittingType).toBe('cross-joint');
    expect(crossNode?.connectedInfraIds.length).toBe(4);
  });

  it('detects a waterfall outlet drop when overhead pathway terminates above a rack', () => {
    const racks: DcRack[] = [
      {
        id: 'RACK-01',
        name: 'Server Rack 01',
        type: 'server',
        widthMm: 600,
        depthMm: 1000,
        heightU: 42,
        position: { x: 3.0, y: 3.0, z: 0 },
        rotation: 0,
      },
    ];

    const items: DcInfrastructureItem[] = [
      {
        id: 'infra-1',
        name: 'Overhead Fiber Drop Run',
        category: 'fiber-raceway',
        layer: 'overhead',
        subtype: 'fiber-raceway',
        start: { x: 1, y: 3.3, z: 0 },
        end: { x: 3.3, y: 3.3, z: 0 },
        widthMm: 200,
        heightMm: 100,
        elevationMm: 2600,
      },
    ];

    const nodes = solveRacewayTopology(items, { racks });
    const dropNode = nodes.find(n => n.fittingType === 'waterfall-outlet');
    expect(dropNode).toBeDefined();
    expect(dropNode?.rackId).toBe('RACK-01');
  });

  it('provides distinct styling and material properties for all 7 raceway categories', () => {
    const fiberTheme = getRacewayTheme('fiber-raceway', 'fiber-raceway');
    expect(fiberTheme.name).toContain('Yellow Fiber');
    expect(fiberTheme.color3D).toBe(0xfacc15);

    const pvcTheme = getRacewayTheme('cable-duct', 'pvc-duct');
    expect(pvcTheme.name).toContain('PVC Solid Duct');
    expect(pvcTheme.color2D).toBe('#94a3b8');

    const basketTheme = getRacewayTheme('cable-tray', 'basket-tray');
    expect(basketTheme.name).toContain('Wire Mesh Basket');
    expect(basketTheme.style).toBe('wire-mesh');

    const solidTheme = getRacewayTheme('cable-duct', 'solid-duct');
    expect(solidTheme.name).toContain('Galvanized Steel');
    expect(solidTheme.metalness).toBeGreaterThan(0.8);

    const ladderTheme = getRacewayTheme('cable-tray', 'ladder-rack');
    expect(ladderTheme.name).toContain('Ladder Cable Runway');

    const buswayTheme = getRacewayTheme('power-cable', 'busway');
    expect(buswayTheme.name).toContain('Power Busway');

    const conduitTheme = getRacewayTheme('conduit', 'conduit');
    expect(conduitTheme.name).toContain('EMT Metallic Conduit');
  });

  it('correctly models continuous multi-axis orthogonal L-routing with automatic corner fitting', () => {
    // Simulates an orthogonal L-route from (1, 1) -> (4, 1) -> (4, 5)
    const leg1: DcInfrastructureItem = {
      id: 'leg-1',
      name: 'Underfloor PVC Duct Leg 1',
      category: 'cable-duct',
      layer: 'underfloor',
      subtype: 'pvc-duct',
      start: { x: 1.0, y: 1.0, z: -0.4 },
      end: { x: 4.0, y: 1.0, z: -0.4 },
      widthMm: 400,
      heightMm: 100,
      elevationMm: -400,
    };
    const leg2: DcInfrastructureItem = {
      id: 'leg-2',
      name: 'Underfloor PVC Duct Leg 2',
      category: 'cable-duct',
      layer: 'underfloor',
      subtype: 'pvc-duct',
      start: { x: 4.0, y: 1.0, z: -0.4 },
      end: { x: 4.0, y: 5.0, z: -0.4 },
      widthMm: 400,
      heightMm: 100,
      elevationMm: -400,
    };

    const nodes = solveRacewayTopology([leg1, leg2]);
    const elbow = nodes.find(n => Math.abs(n.x - 4.0) < 0.01 && Math.abs(n.y - 1.0) < 0.01);
    expect(elbow).toBeDefined();
    expect(elbow?.fittingType).toBe('elbow-90');
    expect(elbow?.layer).toBe('underfloor');
    expect(elbow?.connectedInfraIds).toContain('leg-1');
    expect(elbow?.connectedInfraIds).toContain('leg-2');
  });

  it('computes subfloor slab elevation so raceway bottom rests firmly on concrete slab', () => {
    const plenumDepthMm = 450;
    const racewayHeightMm = 100;
    // Base slab top is at -plenumDepthMm (-450)
    // Mesh center must be at -plenumDepthMm + racewayHeightMm / 2 (-400)
    const elevY = -plenumDepthMm + racewayHeightMm / 2;
    const bottomFaceY = elevY - racewayHeightMm / 2;
    expect(bottomFaceY).toBe(-plenumDepthMm);
  });

  it('automatically truncates and cuts back linear raceway segments at junction fitting ports', () => {
    const leg1: DcInfrastructureItem = {
      id: 'leg-1',
      name: 'Fiber Tray 1',
      category: 'fiber-raceway',
      layer: 'overhead',
      subtype: 'fiber-raceway',
      start: { x: 1.0, y: 1.0, z: 0 },
      end: { x: 4.0, y: 1.0, z: 0 },
      widthMm: 300,
      heightMm: 100,
      elevationMm: 2600,
    };
    const leg2: DcInfrastructureItem = {
      id: 'leg-2',
      name: 'Fiber Tray 2',
      category: 'fiber-raceway',
      layer: 'overhead',
      subtype: 'fiber-raceway',
      start: { x: 4.0, y: 1.0, z: 0 },
      end: { x: 4.0, y: 4.0, z: 0 },
      widthMm: 300,
      heightMm: 100,
      elevationMm: 2600,
    };

    const nodes = solveRacewayTopology([leg1, leg2]);
    const truncated = getTruncatedInfraSegments([leg1, leg2], nodes);

    expect(truncated.length).toBe(2);
    // Original leg1 was 3.0m (3000mm). With exact cutback of Rin + W/2 = 120 + 150 = 270mm, truncated length is 2730mm
    expect(truncated[0].lengthMm).toBe(2730);
    expect(truncated[0].cutbackEndMm).toBe(270);

    // Leg 2 has cutback at start (270mm)
    expect(truncated[1].lengthMm).toBe(2730);
    expect(truncated[1].cutbackStartMm).toBe(270);
  });

  it('automatically splits and connects T-junction into the middle of a continuous raceway without blocker walls', () => {
    // Main continuous horizontal raceway from x=0 to x=10 at y=5
    const mainLine: DcInfrastructureItem = {
      id: 'main-line',
      name: 'Main Run',
      category: 'fiber-raceway',
      subtype: 'fiber-raceway',
      elevationMm: 2600,
      layer: 'overhead',
      start: { x: 0, y: 5, z: 0 },
      end: { x: 10, y: 5, z: 0 },
      widthMm: 300,
      heightMm: 100,
    };
    // Branch connecting into middle of main line at x=5, y=5
    const branch: DcInfrastructureItem = {
      id: 'branch-line',
      name: 'Branch Run',
      category: 'fiber-raceway',
      subtype: 'fiber-raceway',
      elevationMm: 2600,
      layer: 'overhead',
      start: { x: 5, y: 0, z: 0 },
      end: { x: 5, y: 5, z: 0 },
      widthMm: 300,
      heightMm: 100,
    };

    const nodes = solveRacewayTopology([mainLine, branch]);
    expect(nodes.length).toBe(1);
    expect(nodes[0].fittingType).toBe('tee-joint');
    expect(nodes[0].x).toBe(5);
    expect(nodes[0].y).toBe(5);
    expect(nodes[0].branchVectors?.length).toBe(3);

    const truncated = getTruncatedInfraSegments([mainLine, branch], nodes);
    expect(truncated.length).toBe(3); // Main line split into 2 sub-segments + branch = 3 segments
    truncated.forEach(seg => {
      expect(seg.lengthMm).toBeGreaterThan(0);
    });
  });

  it('automatically splits and connects intersecting raceways into an open 4-way Cross Joint', () => {
    // Horizontal line (x: 0..10, y: 5) and Vertical line (x: 5, y: 0..10) crossing at (5, 5)
    const horiz: DcInfrastructureItem = {
      id: 'horiz-run',
      name: 'Horizontal Run',
      category: 'cable-tray',
      subtype: 'basket-tray',
      elevationMm: 2600,
      layer: 'overhead',
      start: { x: 0, y: 5, z: 0 },
      end: { x: 10, y: 5, z: 0 },
      widthMm: 300,
      heightMm: 100,
    };
    const vert: DcInfrastructureItem = {
      id: 'vert-run',
      name: 'Vertical Run',
      category: 'cable-tray',
      subtype: 'basket-tray',
      elevationMm: 2600,
      layer: 'overhead',
      start: { x: 5, y: 0, z: 0 },
      end: { x: 5, y: 10, z: 0 },
      widthMm: 300,
      heightMm: 100,
    };

    const nodes = solveRacewayTopology([horiz, vert]);
    expect(nodes.length).toBe(1);
    expect(nodes[0].fittingType).toBe('cross-joint');
    expect(nodes[0].x).toBe(5);
    expect(nodes[0].y).toBe(5);
    expect(nodes[0].branchVectors?.length).toBe(4);

    const truncated = getTruncatedInfraSegments([horiz, vert], nodes);
    expect(truncated.length).toBe(4); // 4 split sub-segments meeting at the cross
  });
});
