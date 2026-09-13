import { describe, it, expect, beforeEach } from 'vitest';
import { ALL_DC_COMPONENTS, DC_COMPONENT_CATEGORIES, getDcComponentGraphicSvg, getDcComponentBadgeSvg } from '../components/dc-component-graphics';
import { dcState } from '../datacenter/dc-state';
import { DcFloatingToolbar } from '../components/dc-floating-toolbar';

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
});

