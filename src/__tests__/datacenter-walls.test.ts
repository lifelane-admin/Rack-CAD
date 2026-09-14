import { describe, it, expect, beforeEach } from 'vitest';
import { dcState } from '../datacenter/dc-state';
import { DcWallSegment, DcWallItem } from '../datacenter/types';
import { WALL_EQUIPMENT_CATALOG } from '../datacenter/catalog';

describe('Datacenter Transparent Perimeter Walls & Wall-Mounted Infrastructure', () => {
  beforeEach(() => {
    // Reset floor for testing
    dcState.createFloor('Perimeter Test Hall', 12, 8, 600, 'm', 'letters', 'numbers', 'compact');
  });

  it('generates perimeter walls on all 4 sides with custom transparency, height, and thickness', () => {
    const floor = dcState.getActiveFloor();
    expect(floor).toBeDefined();

    dcState.generatePerimeterWalls(['north', 'east', 'south', 'west'], 0.45, 3.5, 180);
    const updatedFloor = dcState.getActiveFloor();
    expect(updatedFloor?.walls).toBeDefined();
    expect(updatedFloor?.walls?.length).toBe(4);

    const northWall = updatedFloor?.walls?.find(w => w.side === 'north');
    const southWall = updatedFloor?.walls?.find(w => w.side === 'south');
    const eastWall = updatedFloor?.walls?.find(w => w.side === 'east');
    const westWall = updatedFloor?.walls?.find(w => w.side === 'west');

    expect(northWall).toBeDefined();
    expect(northWall?.start).toEqual({ x: 0, y: 0 });
    expect(northWall?.end).toEqual({ x: 12, y: 0 });
    expect(northWall?.opacity).toBe(0.45);
    expect(northWall?.heightM).toBe(3.5);
    expect(northWall?.thicknessMm).toBe(180);

    expect(southWall).toBeDefined();
    expect(southWall?.start).toEqual({ x: 12, y: 8 });
    expect(southWall?.end).toEqual({ x: 0, y: 8 });

    expect(eastWall).toBeDefined();
    expect(eastWall?.start).toEqual({ x: 12, y: 0 });
    expect(eastWall?.end).toEqual({ x: 12, y: 8 });

    expect(westWall).toBeDefined();
    expect(westWall?.start).toEqual({ x: 0, y: 8 });
    expect(westWall?.end).toEqual({ x: 0, y: 0 });
  });

  it('supports selective 3-wall generation (e.g. open front / entrance aisle)', () => {
    dcState.generatePerimeterWalls(['north', 'east', 'west'], 0.25, 3.0, 150);
    const floor = dcState.getActiveFloor();
    expect(floor?.walls?.length).toBe(3);
    expect(floor?.walls?.some(w => w.side === 'south')).toBe(false);
    expect(floor?.walls?.every(w => w.opacity === 0.25)).toBe(true);
  });

  it('creates custom coordinate drag-laid wall partitions and updates coordinates', () => {
    const customWall: DcWallSegment = {
      id: 'wall-partition-1',
      name: 'Containment Glass Partition',
      start: { x: 3.0, y: 2.0 },
      end: { x: 9.0, y: 2.0 },
      heightM: 3.2,
      thicknessMm: 120,
      opacity: 0.35,
      color: '#38bdf8',
      side: 'custom',
      items: [],
    };

    dcState.addWall(customWall);
    let floor = dcState.getActiveFloor();
    expect(floor?.walls?.some(w => w.id === 'wall-partition-1')).toBe(true);

    // Update coordinates via drag handles
    dcState.updateWall('wall-partition-1', {
      end: { x: 9.0, y: 5.0 },
      opacity: 0.60,
    });

    floor = dcState.getActiveFloor();
    const updated = floor?.walls?.find(w => w.id === 'wall-partition-1');
    expect(updated?.end).toEqual({ x: 9.0, y: 5.0 });
    expect(updated?.opacity).toBe(0.60);

    // Delete wall
    dcState.deleteWall('wall-partition-1');
    floor = dcState.getActiveFloor();
    expect(floor?.walls?.some(w => w.id === 'wall-partition-1')).toBe(false);
  });

  it('attaches, repositions, and removes wall-mounted infrastructure equipment', () => {
    dcState.generatePerimeterWalls(['north'], 0.4, 3.2, 150);
    const floor = dcState.getActiveFloor();
    const northWall = floor?.walls?.find(w => w.side === 'north');
    expect(northWall).toBeDefined();

    const acItem: DcWallItem = {
      id: 'ac-unit-1',
      wallId: northWall!.id,
      type: 'ac-split',
      name: 'Precision Split A/C 7.5kW',
      positionRatio: 0.25,
      heightOffsetM: 2.2,
      widthMm: 1100,
      heightMm: 380,
      depthMm: 280,
      side: 'inner',
      manufacturer: 'Antigravity Thermal Systems',
      model: 'ATS-SP-75',
    };

    const extinguisherItem: DcWallItem = {
      id: 'fe-unit-1',
      wallId: northWall!.id,
      type: 'fire-extinguisher',
      name: 'Clean Agent Extinguisher',
      positionRatio: 0.75,
      heightOffsetM: 1.1,
      widthMm: 220,
      heightMm: 580,
      depthMm: 200,
      side: 'inner',
    };

    dcState.addWallItem(northWall!.id, acItem);
    dcState.addWallItem(northWall!.id, extinguisherItem);

    let updatedFloor = dcState.getActiveFloor();
    let updatedWall = updatedFloor?.walls?.find(w => w.id === northWall!.id);
    expect(updatedWall?.items?.length).toBe(2);
    expect(updatedWall?.items?.find(it => it.id === 'ac-unit-1')?.positionRatio).toBe(0.25);

    // Reposition item along wall
    dcState.updateWallItem(northWall!.id, 'ac-unit-1', {
      positionRatio: 0.50,
      heightOffsetM: 2.4,
    });

    updatedFloor = dcState.getActiveFloor();
    updatedWall = updatedFloor?.walls?.find(w => w.id === northWall!.id);
    const modifiedAc = updatedWall?.items?.find(it => it.id === 'ac-unit-1');
    expect(modifiedAc?.positionRatio).toBe(0.50);
    expect(modifiedAc?.heightOffsetM).toBe(2.4);

    // Delete single item
    dcState.deleteWallItem(northWall!.id, 'fe-unit-1');
    updatedFloor = dcState.getActiveFloor();
    updatedWall = updatedFloor?.walls?.find(w => w.id === northWall!.id);
    expect(updatedWall?.items?.length).toBe(1);
    expect(updatedWall?.items?.some(it => it.id === 'fe-unit-1')).toBe(false);
  });

  it('updates all wall opacity dynamically in real time', () => {
    dcState.generatePerimeterWalls(['north', 'east', 'south', 'west'], 0.35, 3.2, 150);
    dcState.setAllWallsOpacity(0.80);

    const floor = dcState.getActiveFloor();
    expect(floor?.walls?.every(w => w.opacity === 0.80)).toBe(true);
  });

  it('validates wall equipment catalog presets', () => {
    expect(WALL_EQUIPMENT_CATALOG.length).toBeGreaterThanOrEqual(10);

    const acPreset = WALL_EQUIPMENT_CATALOG.find(p => p.type === 'ac-split');
    expect(acPreset).toBeDefined();
    expect(acPreset?.defaultHeightOffsetM).toBeGreaterThanOrEqual(2.0);

    const epoPreset = WALL_EQUIPMENT_CATALOG.find(p => p.type === 'epo-button');
    expect(epoPreset).toBeDefined();
    expect(epoPreset?.defaultHeightOffsetM).toBeCloseTo(1.4, 0.2);

    const cctvPreset = WALL_EQUIPMENT_CATALOG.find(p => p.type === 'cctv-camera');
    expect(cctvPreset).toBeDefined();
    expect(cctvPreset?.defaultHeightOffsetM).toBeGreaterThanOrEqual(2.5);
  });
});
