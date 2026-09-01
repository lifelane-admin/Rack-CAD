import { DcState, DcFloor, DcRack, DcFloorTile } from './types';

const STORAGE_KEY = 'dc_state_v1';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function buildTileGrid(floor: DcFloor): DcFloorTile[] {
  const tileSizeM = floor.tileSizeMm / 1000;
  const colCount = Math.ceil(floor.lengthM / tileSizeM);
  const rowCount = Math.ceil(floor.widthM / tileSizeM);
  const tiles: DcFloorTile[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const x = c * tileSizeM;
      const y = r * tileSizeM;
      const isPartialW = x + tileSizeM > floor.lengthM;
      const isPartialH = y + tileSizeM > floor.widthM;
      const rowLabel = String.fromCharCode(65 + (r % 26)) + (r >= 26 ? Math.floor(r / 26) : '');
      const colLabel = String(c + 1).padStart(2, '0');
      tiles.push({
        id: `${rowLabel}-${colLabel}`,
        row: r,
        col: c,
        x: parseFloat(x.toFixed(4)),
        y: parseFloat(y.toFixed(4)),
        z: 0,
        widthMm: floor.tileSizeMm,
        depthMm: floor.tileSizeMm,
        type: isPartialW || isPartialH ? 'partial' : 'standard',
      });
    }
  }
  return tiles;
}

const defaultState: DcState = {
  floors: [],
  activeFloorId: null,
  viewMode: '2d',
  gridVisible: true,
  snapEnabled: true,
  labelsVisible: true,
  selectedTileId: null,
  selectedRackId: null,
  zoom: 1,
  panX: 40,
  panY: 40,
};

class DcStateManager {
  private state: DcState;
  private listeners: Array<() => void> = [];

  constructor() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      this.state = saved ? { ...defaultState, ...JSON.parse(saved) } : { ...defaultState };
    } catch {
      this.state = { ...defaultState };
    }
    if (this.state.floors.length === 0) {
      this.initDefaultFloor();
    }
  }

  private initDefaultFloor(): void {
    const floor = this.createFloor('Main Data Hall', 30, 20, 600);
    // Add default rack rows
    const tileM = 0.6;
    const racks: DcRack[] = [
      { id: 'RACK-001', name: 'RACK-001', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 3.6, y: 3.6, z: 0 }, rotation: 0, color: '#1e3a5f', manufacturer: 'APC', model: 'AR3100' },
      { id: 'RACK-002', name: 'RACK-002', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 4.2, y: 3.6, z: 0 }, rotation: 0, color: '#1e3a5f', manufacturer: 'APC', model: 'AR3100' },
      { id: 'RACK-003', name: 'RACK-003', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 4.8, y: 3.6, z: 0 }, rotation: 0, color: '#1e3a5f', manufacturer: 'APC', model: 'AR3100' },
      { id: 'RACK-004', name: 'RACK-004', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 5.4, y: 3.6, z: 0 }, rotation: 0, color: '#1e3a5f', manufacturer: 'APC', model: 'AR3100' },
      { id: 'RACK-005', name: 'RACK-005', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 3.6, y: 7.2, z: 0 }, rotation: 0, color: '#1a4731', manufacturer: 'Vertiv', model: 'VR3100' },
      { id: 'RACK-006', name: 'RACK-006', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 4.2, y: 7.2, z: 0 }, rotation: 0, color: '#1a4731', manufacturer: 'Vertiv', model: 'VR3100' },
      { id: 'RACK-007', name: 'RACK-007', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 4.8, y: 7.2, z: 0 }, rotation: 0, color: '#1a4731', manufacturer: 'Vertiv', model: 'VR3100' },
      { id: 'RACK-008', name: 'RACK-008', widthMm: 600, depthMm: 1200, heightU: 42, position: { x: 5.4, y: 7.2, z: 0 }, rotation: 0, color: '#1a4731', manufacturer: 'Vertiv', model: 'VR3100' },
    ];
    this.updateFloor(floor.id, { racks });
  }

  getState(): DcState { return this.state; }

  setState(partial: Partial<DcState>): void {
    this.state = { ...this.state, ...partial };
    this.persist();
    this.listeners.forEach(fn => fn());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }

  private persist(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch {}
  }

  // Floor operations
  createFloor(name: string, lengthM: number, widthM: number, tileSizeMm: number): DcFloor {
    const floor: DcFloor = {
      id: generateId(),
      name,
      lengthM,
      widthM,
      tileSizeMm,
      tiles: [],
      racks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    floor.tiles = buildTileGrid(floor);
    const floors = [...this.state.floors, floor];
    this.setState({ floors, activeFloorId: floor.id });
    return floor;
  }

  getActiveFloor(): DcFloor | null {
    return this.state.floors.find(f => f.id === this.state.activeFloorId) ?? null;
  }

  updateFloor(id: string, partial: Partial<DcFloor>): void {
    const floors = this.state.floors.map(f => f.id === id ? { ...f, ...partial, updatedAt: new Date().toISOString() } : f);
    this.setState({ floors });
  }

  deleteFloor(id: string): void {
    const floors = this.state.floors.filter(f => f.id !== id);
    const activeFloorId = this.state.activeFloorId === id ? (floors[0]?.id ?? null) : this.state.activeFloorId;
    this.setState({ floors, activeFloorId });
  }

  addRack(rack: DcRack): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const racks = [...floor.racks, rack];
    this.updateFloor(floor.id, { racks });
  }

  updateRack(rackId: string, partial: Partial<DcRack>): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const racks = floor.racks.map(r => r.id === rackId ? { ...r, ...partial } : r);
    this.updateFloor(floor.id, { racks });
  }

  deleteRack(rackId: string): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const racks = floor.racks.filter(r => r.id !== rackId);
    this.updateFloor(floor.id, { racks });
    if (this.state.selectedRackId === rackId) this.setState({ selectedRackId: null });
  }

  duplicateRack(rackId: string): DcRack | null {
    const floor = this.getActiveFloor();
    if (!floor) return null;
    const src = floor.racks.find(r => r.id === rackId);
    if (!src) return null;
    const tileM = floor.tileSizeMm / 1000;
    const newRack: DcRack = {
      ...src,
      id: generateId(),
      name: src.name.replace(/-?(\d+)$/, (_, n) => '-' + String(parseInt(n) + 1).padStart(3, '0')) || src.name + '-COPY',
      position: { x: src.position.x + tileM, y: src.position.y + tileM, z: 0 },
    };
    this.addRack(newRack);
    return newRack;
  }

  rebuildTiles(): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const tiles = buildTileGrid(floor);
    this.updateFloor(floor.id, { tiles });
  }

  snapToGrid(xM: number, yM: number, tileM: number): { x: number; y: number } {
    return {
      x: parseFloat((Math.round(xM / tileM) * tileM).toFixed(4)),
      y: parseFloat((Math.round(yM / tileM) * tileM).toFixed(4)),
    };
  }

  isOverlapping(rack: DcRack, excludeId?: string): boolean {
    const floor = this.getActiveFloor();
    if (!floor) return false;
    const rW = rack.widthMm / 1000;
    const rD = rack.depthMm / 1000;
    const [rX1, rY1] = [rack.position.x, rack.position.y];
    const [rX2, rY2] = [rX1 + (rack.rotation % 180 === 0 ? rW : rD), rY1 + (rack.rotation % 180 === 0 ? rD : rW)];
    return floor.racks.some(r => {
      if (r.id === excludeId || r.id === rack.id) return false;
      const w = r.widthMm / 1000, d = r.depthMm / 1000;
      const [x1, y1] = [r.position.x, r.position.y];
      const [x2, y2] = [x1 + (r.rotation % 180 === 0 ? w : d), y1 + (r.rotation % 180 === 0 ? d : w)];
      return rX1 < x2 && rX2 > x1 && rY1 < y2 && rY2 > y1;
    });
  }

  isOutOfBounds(rack: DcRack): boolean {
    const floor = this.getActiveFloor();
    if (!floor) return true;
    const rW = rack.widthMm / 1000, rD = rack.depthMm / 1000;
    const eW = rack.rotation % 180 === 0 ? rW : rD;
    const eD = rack.rotation % 180 === 0 ? rD : rW;
    return rack.position.x < 0 || rack.position.y < 0 ||
      rack.position.x + eW > floor.lengthM ||
      rack.position.y + eD > floor.widthM;
  }

  generateRackId(): string {
    const floor = this.getActiveFloor();
    const count = (floor?.racks.length ?? 0) + 1;
    return 'RACK-' + String(count).padStart(3, '0');
  }
}

export const dcState = new DcStateManager();
export { buildTileGrid };
