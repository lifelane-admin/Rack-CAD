import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_DC_COMPONENTS, DC_COMPONENT_CATEGORIES, getDcComponentGraphicSvg, getDcComponentBadgeSvg } from '../components/dc-component-graphics';
import { dcState } from '../datacenter/dc-state';
import { DcFloatingToolbar } from '../components/dc-floating-toolbar';
import EventBus from '../core/event-bus';

describe('Datacenter Components & Ducts Dropdown', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="dc-viewport"></div>
    `;
    dcState.createFloor('Main Floor', 30, 20, 600);
  });

  it('contains all 57 components across 8 categories', () => {
    expect(ALL_DC_COMPONENTS.length).toBeGreaterThanOrEqual(50);
    expect(DC_COMPONENT_CATEGORIES.length).toBe(8);

    const rackCat = DC_COMPONENT_CATEGORIES.find(c => c.id === 'racks');
    expect(rackCat).toBeDefined();
    expect(rackCat?.items.length).toBeGreaterThan(0);

    const pathwayCat = DC_COMPONENT_CATEGORIES.find(c => c.id === 'pathways');
    expect(pathwayCat).toBeDefined();
    expect(pathwayCat?.items.some(i => i.pathwayLevel === 'underfloor')).toBe(true);
    expect(pathwayCat?.items.some(i => i.pathwayLevel === 'overhead')).toBe(true);
  });

  it('renders SVG graphics and badges correctly', () => {
    const svg42u = getDcComponentGraphicSvg('rack-server-42u');
    expect(svg42u).toContain('<svg');
    expect(svg42u).toContain('dc-chassis-dark');

    const ufDuctSvg = getDcComponentGraphicSvg('duct-uf-cable');
    expect(ufDuctSvg).toContain('<svg');
    expect(ufDuctSvg).toContain('rect');

    const badgePower = getDcComponentBadgeSvg('power');
    expect(badgePower).toContain('<svg');
  });

  it('initializes DcFloatingToolbar and renders Component Selector Pill', () => {
    const toolbar = new DcFloatingToolbar();
    const toolbarEl = document.getElementById('dc-floating-toolbar');
    expect(toolbarEl).not.toBeNull();

    const selectorPill = toolbarEl?.querySelector('#dc-ft-component-selector-btn');
    expect(selectorPill).not.toBeNull();
    expect(selectorPill?.textContent).toContain('Standard Perforated Door Rack');
    expect(selectorPill?.textContent).toContain('SR-42U');
  });

  it('shows Swap/Optimize button when rack is selected', () => {
    const floor = dcState.getActiveFloor();
    expect(floor).toBeDefined();
    const rackId = dcState.generateRackId();
    dcState.addRack({
      id: rackId,
      name: 'Server-01',
      type: 'server',
      widthMm: 600,
      depthMm: 1000,
      heightU: 42,
      position: { x: 1.2, y: 1.2, z: 0 },
      rotation: 0,
    });
    dcState.setState({ selectedRackId: rackId });

    const toolbar = new DcFloatingToolbar();
    const toolbarEl = document.getElementById('dc-floating-toolbar');
    const optimizeBtn = toolbarEl?.querySelector('#dc-ft-toggle-optimize');
    expect(optimizeBtn).not.toBeNull();
    expect(optimizeBtn?.textContent).toContain('Swap / Optimize');
  });

  it('filters components correctly when clicking sub-category chips', () => {
    const toolbar = new DcFloatingToolbar();
    const toolbarEl = document.getElementById('dc-floating-toolbar');
    expect(toolbarEl).not.toBeNull();

    // Open dropdown menu
    (toolbar as any).isComponentMenuOpen = true;
    (toolbar as any).activeCategoryTab = 'cooling';
    (toolbar as any).activeSubCategoryTab = 'inrow_heatex';
    (toolbar as any).render();

    const menuEl = document.getElementById('dc-component-menu');
    expect(menuEl).not.toBeNull();

    const activeChip = menuEl?.querySelector('.dc-comp-subcat-chip.active');
    expect(activeChip?.textContent?.trim()).toContain('In-Row & Rear Door RDHx');

    const cards = menuEl?.querySelectorAll('.dc-comp-card');
    expect(cards?.length).toBe(2); // In-Row Cooling Unit and Rear Door Heat Exchanger
    const cardTitles = [...(cards || [])].map(c => c.querySelector('.dc-comp-card-title')?.textContent?.trim());
    expect(cardTitles).toContain('In-Row Cooling Unit (300/600mm)');
    expect(cardTitles).toContain('Rear Door Heat Exchanger (RDHx)');

    // Switch to perimeter air
    (toolbar as any).activeSubCategoryTab = 'perimeter_air';
    (toolbar as any).render();
    const perimeterCards = document.querySelectorAll('#dc-component-menu .dc-comp-card');
    expect(perimeterCards.length).toBe(2);
    const perimeterTitles = [...perimeterCards].map(c => c.querySelector('.dc-comp-card-title')?.textContent?.trim());
    expect(perimeterTitles).toContain('CRAC Unit (Direct Expansion DX)');
    expect(perimeterTitles).toContain('CRAH Unit (Chilled Water CW)');
  });

  it('includes 25 photorealistic 3D rack models categorized across 8 rack subcategories', () => {
    const rackCat = DC_COMPONENT_CATEGORIES.find(c => c.id === 'racks');
    expect(rackCat).toBeDefined();
    expect(rackCat?.items.length).toBe(25);

    const subCatIds = rackCat?.subCategories?.map(s => s.id);
    expect(subCatIds).toEqual([
      'all',
      'server',
      'twin_doors',
      'honeycomb',
      'glass_solid',
      'network',
      'colo',
      'enclosure',
      'battery'
    ]);

    const rackCodes = rackCat?.items.map(i => i.code);
    expect(rackCodes).toContain('SR-42U');
    expect(rackCodes).toContain('SR-1070');
    expect(rackCodes).toContain('SR-48U-HD');
    expect(rackCodes).toContain('HD-CHIMNEY');
    expect(rackCodes).toContain('SR-24U');
    expect(rackCodes).toContain('SR-DUAL');
    expect(rackCodes).toContain('SR-SPLIT-HD');
    expect(rackCodes).toContain('SR-SPLIT-LOUV');
    expect(rackCodes).toContain('SR-SPLIT-SOLID');
    expect(rackCodes).toContain('SR-HNYCMB');
    expect(rackCodes).toContain('SR-HNY-DUAL');
    expect(rackCodes).toContain('SR-HNY-MICRO');
    expect(rackCodes).toContain('SR-GLASS');
    expect(rackCodes).toContain('SR-SPLIT-GLASS');
    expect(rackCodes).toContain('SR-SOLID-42U');
    expect(rackCodes).toContain('NR-2POST');
    expect(rackCodes).toContain('NR-4POST');
    expect(rackCodes).toContain('NR-SW800');
    expect(rackCodes).toContain('COLO-2BAY');
    expect(rackCodes).toContain('COLO-4BAY');
    expect(rackCodes).toContain('WM-GLASS');
    expect(rackCodes).toContain('WM-SWING');
    expect(rackCodes).toContain('MICRO-DC');
    expect(rackCodes).toContain('BATT-OPEN');
    expect(rackCodes).toContain('BATT-ENC');
  });

  it('triggers pathway laying mode when a duct or pathway component is selected', () => {
    const toolbar = new DcFloatingToolbar();
    let pathwayEventDetail: any = null;
    EventBus.on('dc:start-lay-pathway', (detail: any) => {
      pathwayEventDetail = detail;
    });

    const ufDuctItem = ALL_DC_COMPONENTS.find(c => c.id === 'duct-uf-cable')!;
    expect(ufDuctItem).toBeDefined();

    (toolbar as any).handlePathwaySelection(ufDuctItem);

    expect(pathwayEventDetail).not.toBeNull();
    expect(pathwayEventDetail.comp.id).toBe('duct-uf-cable');
    expect(pathwayEventDetail.layer).toBe('underfloor');
    expect(pathwayEventDetail.widthMm).toBe(400);

    // Simulate tool-started event emitted by BuildFloorView
    EventBus.emit('dc:tool-started' as any, {
      mode: 'lay-pathway',
      compName: ufDuctItem.name,
      icon: '⚡',
      layer: 'underfloor',
      elevMm: -250,
    });

    // Check that active tool banner is rendered in toolbar
    const banner = document.querySelector('.dc-active-tool-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('LAYING PATHWAY CHANNEL');
    expect(banner?.textContent).toContain('Underfloor Cable Duct');
    expect(banner?.textContent).toContain('Cancel (Esc)');
  });

  it('triggers equipment placement stamping mode when a rack or cooling unit is selected', () => {
    const toolbar = new DcFloatingToolbar();
    let placementEventDetail: any = null;
    EventBus.on('dc:start-place-equipment', (detail: any) => {
      placementEventDetail = detail;
    });

    const rackItem = ALL_DC_COMPONENTS.find(c => c.id === 'rack-server-42u')!;
    expect(rackItem).toBeDefined();

    (toolbar as any).handleGenericEquipmentPlacement(rackItem);

    expect(placementEventDetail).not.toBeNull();
    expect(placementEventDetail.comp.id).toBe('rack-server-42u');
    expect(placementEventDetail.comp.widthMm).toBe(600);
    expect(placementEventDetail.comp.depthMm).toBe(1000);

    // Simulate tool-started event emitted by BuildFloorView
    EventBus.emit('dc:tool-started' as any, {
      mode: 'place-equipment',
      compName: rackItem.name,
      icon: '📦',
    });

    const banner = document.querySelector('.dc-active-tool-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('PLACING EQUIPMENT');
    expect(banner?.textContent).toContain('Standard Perforated Door Rack');
    expect(banner?.textContent).toContain('Cancel (Esc)');
  });

  it('clears active tool mode when cancelling or finishing', () => {
    const toolbar = new DcFloatingToolbar();
    const rackItem = ALL_DC_COMPONENTS.find(c => c.id === 'rack-server-42u')!;
    
    EventBus.emit('dc:tool-started' as any, {
      mode: 'place-equipment',
      compName: rackItem.name,
      icon: '📦',
    });

    expect(document.querySelector('.dc-active-tool-banner')).not.toBeNull();

    // Trigger tool ended / cancel
    EventBus.emit('dc:tool-ended' as any, undefined);
    expect((toolbar as any).activeToolInfo).toBeNull();
    expect(document.querySelector('.dc-active-tool-banner')).toBeNull();
  });

  it('allows selecting an infrastructure raceway and switching type to PVC or Wire Mesh', () => {
    const floor = dcState.getActiveFloor()!;
    const infraId = 'INFRA-TEST-001';
    dcState.addInfrastructureItem({
      id: infraId,
      name: 'Main Cable Duct',
      category: 'cable-duct',
      layer: 'underfloor',
      subtype: 'solid-duct',
      start: { x: 1, y: 1, z: -0.4 },
      end: { x: 5, y: 1, z: -0.4 },
      widthMm: 400,
      heightMm: 80,
      elevationMm: -410,
    });

    dcState.setState({ selectedInfraId: infraId, selectedRackId: null, selectedTileId: null });

    const toolbar = new DcFloatingToolbar();
    const pvcBtn = document.querySelector('#dc-ft-infra-pvc') as HTMLButtonElement;
    expect(pvcBtn).not.toBeNull();

    pvcBtn.click();

    const updated = dcState.getActiveFloor()?.infrastructure?.find(i => i.id === infraId);
    expect(updated?.subtype).toBe('pvc-duct');
    expect(updated?.name).toBe('PVC Cable Duct');
  });

  it('sticks underfloor raceways to concrete subfloor slab', () => {
    const floor = dcState.getActiveFloor()!;
    const infraId = 'INFRA-TEST-002';
    dcState.addInfrastructureItem({
      id: infraId,
      name: 'Server Row Tray',
      category: 'cable-tray',
      layer: 'underfloor',
      subtype: 'basket-tray',
      start: { x: 2, y: 2, z: -0.2 },
      end: { x: 8, y: 2, z: -0.2 },
      widthMm: 300,
      heightMm: 80,
      elevationMm: -220,
    });

    dcState.setState({ selectedInfraId: infraId });

    const toolbar = new DcFloatingToolbar();
    const stickBtn = document.querySelector('#dc-ft-infra-stick') as HTMLButtonElement;
    expect(stickBtn).not.toBeNull();

    stickBtn.click();

    const updated = dcState.getActiveFloor()?.infrastructure?.find(i => i.id === infraId);
    expect(updated?.mountType).toBe('slab-resting');
    const plenumDepth = floor.raisedFloorHeightMm || 450;
    expect(updated?.elevationMm).toBe(-(plenumDepth - 40));
  });

  it('sets air channel tiles to 300mm default height to prevent raceway obstruction', () => {
    const floor = dcState.getActiveFloor()!;
    const tile = floor.tiles[0];
    dcState.setFloorTileType(tile.id, 'air-channel', 'north');

    const updatedTile = dcState.getActiveFloor()?.tiles.find(t => t.id === tile.id);
    expect(updatedTile?.type).toBe('air-channel');
    expect(updatedTile?.airflowDir).toBe('north');
    expect(updatedTile?.airChannelHeightMm).toBe(300);
  });
});


