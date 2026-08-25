import { serializeState } from '../../ai/state-serializer';
import { AppState } from '../../core/types';

const minimalState: AppState = {
  theme: 'dark', tool: 'select',
  transform: { x: 0, y: 0, scale: 1 },
  gridVisible: true, snapEnabled: true, rulersVisible: true,
  racks: [{ id: 'r1', name: 'Rack 1', units: 42, x: 0, y: 0 }],
  devices: [],
  cables: [],
  bundles: [],
  textLabels: [],
  imageAssets: [],
  validationAlerts: [],
  selection: [],
  cableInProgress: null,
  airdropDestination: false,
  sidebarCollapsed: false,
  propertiesCollapsed: false,
  showLegends: false,
  selectedCableType: 'general',
  selectedCableColor: '#78909c',
  selectedCableBend: 10,
  selectedCableTermination: 'RJ45',
  cabinetViewMode: 'front',
  cabinetDrawMode: 'default',
  cabinetCoverVisible: true,
  isometricMode: false,
  show3DPanel: false,
  presenterMode: false,
  cableRoutingTrayMode: 'overhead',
  aiMode: false,
  aiProvider: 'rules',
  customTemplates: [],
  previewDiff: null,
  activeView: 'rack',
  hybridLayoutMode: 'split',
  cloudNodes: [],
  cloudContainers: [],
  cloudConnectors: [],
  cloudHierarchies: [],
  floatingToolbarVisible: false,
};

describe('serializeState', () => {
  it('includes rack id and name', () => {
    const ctx = serializeState(minimalState);
    expect(ctx.racks[0].id).toBe('r1');
    expect(ctx.racks[0].name).toBe('Rack 1');
  });

  it('includes selected id when selection present', () => {
    const state = { ...minimalState, selection: [{ type: 'rack' as const, id: 'r1' }] };
    const ctx = serializeState(state);
    expect(ctx.selectedId).toBe('r1');
  });

  it('cables include fromPort and toPort', () => {
    const state = {
      ...minimalState,
      cables: [{
        id: 'c1', name: 'Cable 1', type: 'general' as const, color: '#fff',
        sourcePortId: 'p1', destPortId: 'p2', bendPoints: [],
        thickness: 2, bendRadius: 10, bundleId: null, notes: '',
      }],
    };
    const ctx = serializeState(state);
    expect(ctx.cables[0].fromPort).toBe('p1');
    expect(ctx.cables[0].toPort).toBe('p2');
  });
});
