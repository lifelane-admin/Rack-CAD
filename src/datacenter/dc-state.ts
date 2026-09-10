import { DcState, DcFloor, DcRack, DcFloorTile, DcUnit, DcAddressFormat, DcTileType, DcAirflowDirection, DcInfrastructureItem } from './types';

const STORAGE_KEY = 'dc_state_v3';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getRowLabel(r: number, scheme: 'letters' | 'numbers' = 'letters'): string {
  if (scheme === 'numbers') {
    return String(r + 1).padStart(2, '0');
  }
  // Standard spreadsheet/datacenter letter sequence: A..Z, AA..AZ, etc.
  let label = '';
  let n = r;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function getColLabel(c: number, scheme: 'letters' | 'numbers' = 'numbers', format: DcAddressFormat = 'compact'): string {
  if (scheme === 'letters') {
    let label = '';
    let n = c;
    while (n >= 0) {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    }
    return label;
  }
  // In compact format (e.g. A1, A2), 1-based without leading 0 for single digit, or 2 digits if hyphen
  return format === 'compact' ? String(c + 1) : String(c + 1).padStart(2, '0');
}

function buildTileGrid(floor: DcFloor): DcFloorTile[] {
  const tileSizeM = floor.tileSizeMm / 1000;
  const colCount = Math.ceil(floor.lengthM / tileSizeM);
  const rowCount = Math.ceil(floor.widthM / tileSizeM);
  const tiles: DcFloorTile[] = [];
  const rScheme = floor.rowScheme ?? 'letters';
  const cScheme = floor.colScheme ?? 'numbers';
  const format = floor.addressFormat ?? 'compact';
  const separator = format === 'hyphen' ? '-' : '';

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const x = c * tileSizeM;
      const y = r * tileSizeM;
      const isPartialW = x + tileSizeM > floor.lengthM;
      const isPartialH = y + tileSizeM > floor.widthM;
      const rowLabel = getRowLabel(r, rScheme);
      const colLabel = getColLabel(c, cScheme, format);
      tiles.push({
        id: `${rowLabel}${separator}${colLabel}`,
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
  floorOpacity: 1.0,
  xrayMode: false,
  selectedTileId: null,
  selectedRackId: null,
  selectedInfraId: null,
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
  }

  resetToEmptyFloor(
    name: string = 'Main Data Hall',
    lengthM: number = 12,
    widthM: number = 8,
    tileSizeMm: number = 600,
    unit: DcUnit = 'm',
    rowScheme: 'letters' | 'numbers' = 'letters',
    colScheme: 'letters' | 'numbers' = 'numbers',
    addressFormat: DcAddressFormat = 'compact'
  ): DcFloor {
    const floor: DcFloor = {
      id: generateId(),
      name,
      unit,
      lengthM,
      widthM,
      tileSizeMm,
      rowScheme,
      colScheme,
      addressFormat,
      tiles: [],
      racks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    floor.tiles = buildTileGrid(floor);
    this.setState({
      floors: [floor],
      activeFloorId: floor.id,
      selectedRackId: null,
      selectedTileId: null,
    });
    return floor;
  }

  clearCurrentFloor(): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    this.updateFloor(floor.id, { racks: [] });
    this.setState({ selectedRackId: null, selectedTileId: null });
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
  createFloor(
    name: string,
    lengthM: number,
    widthM: number,
    tileSizeMm: number,
    unit: DcUnit = 'm',
    rowScheme: 'letters' | 'numbers' = 'letters',
    colScheme: 'letters' | 'numbers' = 'numbers',
    addressFormat: DcAddressFormat = 'compact'
  ): DcFloor {
    const floor: DcFloor = {
      id: generateId(),
      name,
      unit,
      lengthM,
      widthM,
      tileSizeMm,
      rowScheme,
      colScheme,
      addressFormat,
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

  updateTile(tileId: string, partial: Partial<DcFloorTile>): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const tiles = floor.tiles.map(t => t.id === tileId ? { ...t, ...partial } : t);
    this.updateFloor(floor.id, { tiles });
  }

  setFloorTileType(tileId: string, type: DcTileType, airflowDir?: DcAirflowDirection): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const tiles = floor.tiles.map(t => {
      if (t.id === tileId) {
        return {
          ...t,
          type,
          airflowDir: type === 'air-channel' ? (airflowDir || 'north') : undefined,
        };
      }
      return t;
    });
    this.updateFloor(floor.id, { tiles });
  }

  addInfrastructureItem(item: DcInfrastructureItem): void {
    const floor = this.getActiveFloor();
    if (!floor) return;
    const infrastructure = [...(floor.infrastructure || []), item];
    this.updateFloor(floor.id, { infrastructure });
  }

  updateInfrastructureItem(itemId: string, partial: Partial<DcInfrastructureItem>): void {
    const floor = this.getActiveFloor();
    if (!floor || !floor.infrastructure) return;
    const infrastructure = floor.infrastructure.map(i => i.id === itemId ? { ...i, ...partial } : i);
    this.updateFloor(floor.id, { infrastructure });
  }

  deleteInfrastructureItem(itemId: string): void {
    const floor = this.getActiveFloor();
    if (!floor || !floor.infrastructure) return;
    const infrastructure = floor.infrastructure.filter(i => i.id !== itemId);
    this.updateFloor(floor.id, { infrastructure });
    if (this.state.selectedInfraId === itemId) this.setState({ selectedInfraId: null });
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
