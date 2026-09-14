import { describe, it, expect } from 'vitest';
import { DATACENTER_CATALOG, CATEGORY_DEFINITIONS, WALL_EQUIPMENT_CATALOG } from '../datacenter/catalog';
import { ALL_DC_COMPONENTS, DC_COMPONENT_CATEGORIES, getDcComponentGraphicSvg } from '../components/dc-component-graphics';

describe('Datacenter Equipment Library V3 Consolidated Master Specification', () => {
  it('should have all canonical category definitions', () => {
    const categoryIds = CATEGORY_DEFINITIONS.map(c => c.id);
    expect(categoryIds).toContain('all');
    expect(categoryIds).toContain('wall-equipment');
    expect(categoryIds).toContain('architecture');
    expect(categoryIds).toContain('housing');
    expect(categoryIds).toContain('compute');
    expect(categoryIds).toContain('storage');
    expect(categoryIds).toContain('network');
    expect(categoryIds).toContain('structured-cabling');
    expect(categoryIds).toContain('containment');
    expect(categoryIds).toContain('pathways');
    expect(categoryIds).toContain('flooring');
    expect(categoryIds).toContain('power-distribution');
    expect(categoryIds).toContain('backup-generation');
    expect(categoryIds).toContain('cooling');
    expect(categoryIds).toContain('fire-safety');
    expect(categoryIds).toContain('security');
    expect(categoryIds).toContain('bms-dcim');
    expect(categoryIds).toContain('plumbing');
    expect(categoryIds).toContain('earthing');
    expect(categoryIds).toContain('operations');
    expect(categoryIds).toContain('facility-plant');
  });

  it('should have non-zero presets for every primary category', () => {
    const categoriesToCheck = [
      'housing',
      'architecture',
      'wall-equipment',
      'compute',
      'network',
      'storage',
      'power-distribution',
      'backup-generation',
      'cooling',
      'structured-cabling',
      'containment',
      'pathways',
      'flooring',
      'fire-safety',
      'security',
      'bms-dcim',
      'plumbing',
      'earthing',
      'operations',
      'facility-plant'
    ];

    for (const cat of categoriesToCheck) {
      if (cat === 'wall-equipment') {
        expect(WALL_EQUIPMENT_CATALOG.length).toBeGreaterThan(0);
      } else {
        const count = DATACENTER_CATALOG.filter(item => item.category === cat).length;
        expect(count, `Category "${cat}" should have at least 1 preset`).toBeGreaterThan(0);
      }
    }
  });

  it('should have exhaustive items for pathways and flooring specifically', () => {
    const pathwayItems = DATACENTER_CATALOG.filter(item => item.category === 'pathways');
    expect(pathwayItems.length).toBeGreaterThanOrEqual(10);

    const flooringItems = DATACENTER_CATALOG.filter(item => item.category === 'flooring');
    expect(flooringItems.length).toBeGreaterThanOrEqual(10);
  });

  it('should have valid physical dimensions and metadata for all presets', () => {
    for (const preset of DATACENTER_CATALOG) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.widthMm).toBeGreaterThan(0);
      expect(preset.depthMm).toBeGreaterThan(0);
      expect(preset.category).toBeTruthy();
      expect(preset.spaceType).toBeTruthy();
    }
  });

  it('should render SVGs for all components without errors', () => {
    for (const comp of ALL_DC_COMPONENTS) {
      const svg = getDcComponentGraphicSvg(comp.id);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    }
  });

  it('should have component categories linking all items', () => {
    expect(DC_COMPONENT_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    for (const group of DC_COMPONENT_CATEGORIES) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
