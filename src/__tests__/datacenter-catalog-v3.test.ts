import { describe, it, expect } from 'vitest';
import { DATACENTER_CATALOG, CATEGORY_DEFINITIONS, WALL_EQUIPMENT_CATALOG } from '../datacenter/catalog';
import { ALL_DC_COMPONENTS, DC_COMPONENT_CATEGORIES, getDcComponentGraphicSvg } from '../components/dc-component-graphics';
import { deviceCatalog } from '../library/device-catalog';

describe('Datacenter & Rack Builder Delta Upgrade Master Specification', () => {
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

  it('should include key Delta Upgrade items in Data Center Master Catalog (Table 1)', () => {
    const dcIds = DATACENTER_CATALOG.map(item => item.id);
    // Electrical / Transfer / Generator
    expect(dcIds).toContain('elec-ht-meter-panel');
    expect(dcIds).toContain('elec-smdb-panel-800a');
    expect(dcIds).toContain('elec-acb-vcb-breaker-panel');
    expect(dcIds).toContain('elec-protection-relay-panel');
    expect(dcIds).toContain('elec-spd-transient-panel');
    expect(dcIds).toContain('elec-amf-panel');
    expect(dcIds).toContain('elec-generator-sync-panel');
    expect(dcIds).toContain('elec-fuel-day-tank-pump');
    expect(dcIds).toContain('elec-battery-monitoring-bms');
    expect(dcIds).toContain('elec-ups-maintenance-bypass');
    
    // HVAC / Liquid / Air
    expect(dcIds).toContain('hvac-ahu-central-unit');
    expect(dcIds).toContain('hvac-fcu-fan-coil-unit');
    expect(dcIds).toContain('hvac-plate-heat-exchanger');
    expect(dcIds).toContain('hvac-expansion-tank');
    expect(dcIds).toContain('hvac-supply-return-air-duct');
    expect(dcIds).toContain('hvac-motorized-fire-damper');
    expect(dcIds).toContain('hvac-vav-terminal-box');

    // Fire, Security & BMS
    expect(dcIds).toContain('fire-heat-flame-detector');
    expect(dcIds).toContain('fire-inert-gas-system');
    expect(dcIds).toContain('fire-preaction-valve-system');
    expect(dcIds).toContain('fire-facp-alarm-panel');
    expect(dcIds).toContain('fire-hydrant-hose-station');
    expect(dcIds).toContain('sec-access-door-maglock');
    expect(dcIds).toContain('sec-door-access-controller-panel');
    expect(dcIds).toContain('sec-nvr-vms-server-64ch');
    expect(dcIds).toContain('sec-intercom-panic-station');
    expect(dcIds).toContain('bms-temp-humidity-probes');
    expect(dcIds).toContain('bms-dp-airflow-sensor-kit');
    expect(dcIds).toContain('bms-energy-pq-gateway');
    expect(dcIds).toContain('bms-plc-scada-controller');

    // Architecture, Plumbing & Utility
    expect(dcIds).toContain('arch-suspended-ceiling-plenum');
    expect(dcIds).toContain('arch-acoustic-insulated-panel');
    expect(dcIds).toContain('arch-frameless-glass-wall');
    expect(dcIds).toContain('plumb-condenser-water-pipe');
    expect(dcIds).toContain('plumb-cdu-liquid-pipework');
    expect(dcIds).toContain('plumb-thermal-buffer-tank');
    expect(dcIds).toContain('plumb-water-treatment-system');
    expect(dcIds).toContain('plumb-motorized-control-valve');
    expect(dcIds).toContain('util-exhaust-stack-silencer');
    expect(dcIds).toContain('util-bulk-fuel-tank-20k');
    expect(dcIds).toContain('util-process-water-tank-50k');
    expect(dcIds).toContain('util-oil-water-separator');
    expect(dcIds).toContain('util-loading-bay-dock-leveler');
  });

  it('should include key Delta Upgrade items in Rack Builder Device Catalog (Table 2)', () => {
    const rackIds = deviceCatalog.map(d => d.id);
    // Accessories & Cable Management
    expect(rackIds).toContain('blank-4u');
    expect(rackIds).toContain('shelf-1u-cantilever');
    expect(rackIds).toContain('rail-1u-mounting');
    expect(rackIds).toContain('mgr-1u-horizontal-finger');
    expect(rackIds).toContain('mgr-2u-horizontal-finger');
    expect(rackIds).toContain('brush-panel-1u-dual');
    expect(rackIds).toContain('ring-panel-1u');
    expect(rackIds).toContain('drop-waterfall-bracket');

    // Passive Network & Fiber
    expect(rackIds).toContain('patch-1u-fiber-sc-24p');
    expect(rackIds).toContain('liu-1u-fiber-splice');
    expect(rackIds).toContain('odf-2u-fiber-chassis');
    expect(rackIds).toContain('splice-tray-1u');

    // Active IT & Security
    expect(rackIds).toContain('sec-1u-ids-ips');
    expect(rackIds).toContain('net-1u-wireless-controller');
    expect(rackIds).toContain('net-1u-hardware-load-balancer');
    expect(rackIds).toContain('san-1u-fc-switch');
    expect(rackIds).toContain('storage-2u-jbod-shelf');

    // Power, Monitoring, Cooling, Earthing
    expect(rackIds).toContain('pdu-1u-monitored-10p');
    expect(rackIds).toContain('pdu-1u-switched-smart');
    expect(rackIds).toContain('ats-1u-30a-rack');
    expect(rackIds).toContain('cord-c13-c19-kit');
    expect(rackIds).toContain('mon-1u-environmental-appliance');
    expect(rackIds).toContain('mon-1u-vibration-lock-gateway');
    expect(rackIds).toContain('ground-1u-rack-busbar');
    expect(rackIds).toContain('ground-bonding-strap-kit');
    expect(rackIds).toContain('cooling-1u-chimney-baffle');
    expect(rackIds).toContain('cooling-2u-fan-tray-smart');
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

  it('should render subcategory headers in Datacenter BuildFloorView catalog panel', async () => {
    const { BuildFloorView } = await import('../datacenter/build-floor');
    const dcContainer = document.createElement('div');
    document.body.appendChild(dcContainer);
    new BuildFloorView(dcContainer);

    const subgroupHeaders = dcContainer.querySelectorAll('.cat-subgroup-header');
    expect(subgroupHeaders.length).toBeGreaterThanOrEqual(20);

    const headerTexts = Array.from(subgroupHeaders).map(h => (h.textContent || '').toLowerCase());

    // Verify Cabling & Pathways subgroups (Underfloor Pathways & Overhead Pathways)
    expect(headerTexts.some(t => t.includes('underfloor pathways'))).toBe(true);
    expect(headerTexts.some(t => t.includes('overhead pathways'))).toBe(true);

    // Verify Flooring Systems subgroups
    expect(headerTexts.some(t => t.includes('raised floor tiles & grilles'))).toBe(true);
    expect(headerTexts.some(t => t.includes('structure, grommets & access'))).toBe(true);

    // Verify Racks & Enclosures subgroups
    expect(headerTexts.some(t => t.includes('standard & high-density server racks'))).toBe(true);
    expect(headerTexts.some(t => t.includes('colocation, open frame & wall mounts'))).toBe(true);

    // Verify Architecture & Walls subgroups
    expect(headerTexts.some(t => t.includes('interactive cad & perimeter tools'))).toBe(true);
    expect(headerTexts.some(t => t.includes('walls, partitions & doors'))).toBe(true);
    expect(headerTexts.some(t => t.includes('ceilings & structural plenums'))).toBe(true);

    // Verify Power Distribution subgroups
    expect(headerTexts.some(t => t.includes('rack pdus & transfer switches'))).toBe(true);
    expect(headerTexts.some(t => t.includes('floor panels, busways & switchgear'))).toBe(true);

    // Verify UPS & Backup Generation subgroups
    expect(headerTexts.some(t => t.includes('ups systems & battery storage'))).toBe(true);
    expect(headerTexts.some(t => t.includes('standby generation & mv substations'))).toBe(true);

    // Verify Cooling & HVAC subgroups
    expect(headerTexts.some(t => t.includes('in-row & perimeter crac/crah'))).toBe(true);
    expect(headerTexts.some(t => t.includes('liquid cooling & central plant'))).toBe(true);
    expect(headerTexts.some(t => t.includes('air distribution ducts & dampers'))).toBe(true);

    // Verify Aisle Containment subgroups
    expect(headerTexts.some(t => t.includes('cold aisle containment'))).toBe(true);
    expect(headerTexts.some(t => t.includes('hot aisle chimneys & baffles'))).toBe(true);

    // Verify Fire Safety & Physical Security subgroups
    expect(headerTexts.some(t => t.includes('detection & very early warning'))).toBe(true);
    expect(headerTexts.some(t => t.includes('suppression, alarms & hydrants'))).toBe(true);
    expect(headerTexts.some(t => t.includes('access control & portals'))).toBe(true);
    expect(headerTexts.some(t => t.includes('surveillance & communication'))).toBe(true);
  });

  it('should render subcategory headers in Rack Builder Sidebar catalog', async () => {
    const { Sidebar } = await import('../components/sidebar');
    const { default: State } = await import('../core/state');
    State.setState({ activeView: 'rack' });

    const catalogContainer = document.createElement('div');
    catalogContainer.id = 'catalog-container';
    document.body.appendChild(catalogContainer);

    const sidebar = new Sidebar(catalogContainer);
    sidebar.render();

    const subgroupHeaders = catalogContainer.querySelectorAll('.cat-subgroup-header');
    expect(subgroupHeaders.length).toBeGreaterThanOrEqual(15);

    const headerTexts = Array.from(subgroupHeaders).map(h => (h.textContent || '').toLowerCase());

    // Verify Racks & Cabinets subgroups
    expect(headerTexts.some(t => t.includes('standard server cabinets'))).toBe(true);
    expect(headerTexts.some(t => t.includes('open relay frames'))).toBe(true);
    expect(headerTexts.some(t => t.includes('wall mount & edge'))).toBe(true);

    // Verify Servers subgroups
    expect(headerTexts.some(t => t.includes('rack servers & hci appliances'))).toBe(true);
    expect(headerTexts.some(t => t.includes('ai gpu accelerators'))).toBe(true);
    expect(headerTexts.some(t => t.includes('blade enclosures & chassis'))).toBe(true);

    // Verify Switches subgroups
    expect(headerTexts.some(t => t.includes('top-of-rack & access switches'))).toBe(true);
    expect(headerTexts.some(t => t.includes('spine, core & packet brokers'))).toBe(true);

    // Verify Routers subgroups
    expect(headerTexts.some(t => t.includes('enterprise & edge routers'))).toBe(true);
    expect(headerTexts.some(t => t.includes('wireless lan controllers'))).toBe(true);

    // Verify PDU subgroups
    expect(headerTexts.some(t => t.includes('vertical pdus'))).toBe(true);
    expect(headerTexts.some(t => t.includes('horizontal pdus & smart relays'))).toBe(true);
    expect(headerTexts.some(t => t.includes('environmental & security sensors'))).toBe(true);

    // Verify Patch Panels subgroups
    expect(headerTexts.some(t => t.includes('copper patch panels'))).toBe(true);
    expect(headerTexts.some(t => t.includes('fiber optic odf, liu & mpo'))).toBe(true);

    // Verify Cables subgroups
    expect(headerTexts.some(t => t.includes('copper twisted pair & dac'))).toBe(true);
    expect(headerTexts.some(t => t.includes('fiber optic patch cords'))).toBe(true);
    expect(headerTexts.some(t => t.includes('equipment power cords'))).toBe(true);

    // Verify Cable Managers subgroups
    expect(headerTexts.some(t => t.includes('vertical cable managers'))).toBe(true);
    expect(headerTexts.some(t => t.includes('horizontal cable managers'))).toBe(true);
  });
});

