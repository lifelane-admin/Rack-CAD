import { describe, it, expect, beforeEach } from 'vitest';
import { ARCHITECTURE_TEMPLATES, projectStore } from '../storage/project-store';
import { getTemplatePayloadJson } from '../storage/template-data-generator';
import { importJSON } from '../utils/export';
import { stateManager } from '../core/state';
import { ExcelExportEngine } from '../model/excel-export-engine';
import { physicalInfrastructureModel } from '../model/physical-model';
import { renderCable } from '../renderers/cable-renderer';
import { computeSmartRouting } from '../utils/routing';

describe('Architecture Blueprint Templates & Excel Export', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('all 6 architecture templates have deterministic blueprints with real objects and cables', () => {
    expect(ARCHITECTURE_TEMPLATES.length).toBe(6);

    for (const tpl of ARCHITECTURE_TEMPLATES) {
      const jsonStr = getTemplatePayloadJson(tpl.id);
      expect(jsonStr).toBeTruthy();
      expect(jsonStr).not.toBe('{}');

      const data = JSON.parse(jsonStr);
      expect(data.version).toBe(1);

      // Verify physical or cloud objects are populated
      if (tpl.targetCategory === 'rack') {
        expect(data.racks.length).toBeGreaterThan(0);
        expect(data.devices.length).toBeGreaterThan(0);
        expect(data.cables.length).toBeGreaterThan(0);
      } else if (tpl.targetCategory.startsWith('cloud')) {
        expect(data.cloudContainers.length + data.cloudNodes.length).toBeGreaterThan(0);
        expect(data.cloudConnectors.length).toBeGreaterThan(0);
      }
    }
  });

  it('createProjectFromTemplate populates the project dataJson rather than empty string', () => {
    const cephTpl = ARCHITECTURE_TEMPLATES.find(t => t.id === 'tpl-ceph-mesh')!;
    expect(cephTpl).toBeDefined();

    const proj = projectStore.createProjectFromTemplate(cephTpl);
    expect(proj.name).toBe(cephTpl.title);
    expect(proj.category).toBe('rack');
    expect(proj.dataJson).not.toBe('{}');

    const parsed = JSON.parse(proj.dataJson);
    expect(parsed.racks.length).toBe(1);
    expect(parsed.devices.length).toBeGreaterThan(5); // nodes + pdus + switches
    expect(parsed.cables.length).toBeGreaterThan(5); // mesh dacs + mgmt + power
  });

  it('starter sample projects have full populated architecture data instead of empty {}', () => {
    const all = projectStore.getAllProjects();
    expect(all.length).toBeGreaterThan(0);

    for (const p of all) {
      expect(p.dataJson).toBeTruthy();
      expect(p.dataJson).not.toBe('{}');
      const parsed = JSON.parse(p.dataJson);
      const totalObjects = (parsed.racks?.length || 0) + (parsed.devices?.length || 0) + (parsed.cloudNodes?.length || 0) + (parsed.cloudContainers?.length || 0);
      expect(totalObjects).toBeGreaterThan(0);
    }
  });

  it('importJSON successfully loads template blueprint into stateManager and syncs physicalInfrastructureModel', () => {
    const cephPayload = getTemplatePayloadJson('tpl-ceph-mesh');
    importJSON(cephPayload);

    const s = stateManager.getState();
    expect(s.racks.length).toBe(1);
    expect(s.devices.length).toBeGreaterThanOrEqual(5);
    expect(s.cables.length).toBeGreaterThanOrEqual(8);

    for (const cable of s.cables) {
      const srcPos = cable.floatingSource || stateManager.getPortWorldPosition(cable.sourcePortId);
      const destPos = cable.floatingDest || (cable.destPortId ? stateManager.getPortWorldPosition(cable.destPortId) : null);
      expect(srcPos, `Cable ${cable.id} (${cable.name}) sourcePos should exist for port ${cable.sourcePortId}`).not.toBeNull();
      expect(destPos, `Cable ${cable.id} (${cable.name}) destPos should exist for port ${cable.destPortId}`).not.toBeNull();
    }

    // Verify physicalInfrastructureModel is synchronized
    const modelRacks = physicalInfrastructureModel.getRacks();
    const modelObjects = physicalInfrastructureModel.getObjects();
    const modelCables = physicalInfrastructureModel.getCables();

    expect(modelRacks.length).toBe(1);
    expect(modelObjects.length).toBeGreaterThan(0);
    expect(modelCables.length).toBeGreaterThan(0);
  });

  it('ExcelExportEngine generates comprehensive engineering blueprint workbook', () => {
    const cephPayload = getTemplatePayloadJson('tpl-ceph-mesh');
    importJSON(cephPayload);

    const sheets = ExcelExportEngine.generateSheets(physicalInfrastructureModel);
    expect(sheets.length).toBeGreaterThanOrEqual(14);

    const sheetNames = sheets.map(s => s.name);
    expect(sheetNames).toContain('01_Project_Summary');
    expect(sheetNames).toContain('02_Architecture_Summary');
    expect(sheetNames).toContain('03_Rack_Inventory');
    expect(sheetNames).toContain('Object_Inventory');
    expect(sheetNames).toContain('BOM');
    expect(sheetNames).toContain('Cable_Schedule');
    expect(sheetNames).toContain('Power_Schedule');

    // Verify Cable_Schedule has populated rows
    const cableSheet = sheets.find(s => s.name === 'Cable_Schedule')!;
    expect(cableSheet.rows.length).toBeGreaterThan(1); // Header + cable rows
  });

  it('verifies that all cables across all rack templates render SVG groups and paths', () => {
    const rackTemplateIds = ['tpl-ceph-mesh', 'tpl-hyperv-cluster', 'tpl-proxmox-ceph', 'tpl-ai-gpu-pod'];

    for (const tplId of rackTemplateIds) {
      const payload = getTemplatePayloadJson(tplId);
      importJSON(payload);

      const s = stateManager.getState();
      const fakeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;

      expect(s.cables.length).toBeGreaterThan(0);

      for (const cable of s.cables) {
        const sourcePos = cable.floatingSource || stateManager.getPortWorldPosition(cable.sourcePortId);
        const destPos = cable.floatingDest || (cable.destPortId ? stateManager.getPortWorldPosition(cable.destPortId) : null);

        expect(sourcePos, `Template ${tplId} cable ${cable.id} source position`).not.toBeNull();
        expect(destPos, `Template ${tplId} cable ${cable.id} destination position`).not.toBeNull();

        const group = renderCable(cable, sourcePos!, destPos!, fakeLayer);
        expect(group).toBeTruthy();
        expect(fakeLayer.children.length).toBeGreaterThan(0);
      }
    }
  });

  it('verifies that all switches across all templates have standard port counts (>= 24 ports)', () => {
    const rackTemplateIds = ['tpl-ceph-mesh', 'tpl-hyperv-cluster', 'tpl-proxmox-ceph', 'tpl-ai-gpu-pod'];

    for (const tplId of rackTemplateIds) {
      const payload = getTemplatePayloadJson(tplId);
      importJSON(payload);

      const s = stateManager.getState();
      const switches = s.devices.filter(d => d.templateId.includes('sw-') || d.templateId.includes('switch') || (d as any).category === 'switch');
      expect(switches.length).toBeGreaterThan(0);

      for (const sw of switches) {
        const nonEarPorts = (sw.ports || []).filter(p => !p.id.includes('-ear-'));
        expect(nonEarPorts.length, `Switch ${sw.name} (${sw.id}) in ${tplId} should have >= 24 ports`).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('verifies switch data port mappings and Application Rule Book power cabling standard', () => {
    const payload = getTemplatePayloadJson('tpl-hyperv-cluster');
    importJSON(payload);

    const s = stateManager.getState();
    const sw = s.devices.find(d => d.id === 'dev-hv-sw-01')!;

    // 1. Switch data ports must be SFP28/data, leaving MGMT & Console separate
    const p1 = sw.ports.find(p => p.id === 'hv-sw-p1')!;
    const p2 = sw.ports.find(p => p.id === 'hv-sw-p2')!;
    const p3 = sw.ports.find(p => p.id === 'hv-sw-p3')!;
    expect(p1.type).toBe('sfp28');
    expect(p2.type).toBe('sfp28');
    expect(p3.type).toBe('sfp28');
    expect(p3.id).not.toBe('tor-mgmt');

    // 2. Uplink to switch terminates at SFP28 data port
    const arcCable = s.cables.find(c => c.id === 'cbl-arc-tor')!;
    expect(arcCable.destPortId).toBe('hv-sw-p3');
    const arcDestPos = stateManager.getPortWorldPosition(arcCable.destPortId)!;
    expect(arcDestPos).toBeDefined();

    // 3. Power Cabling Standard (Feed A: Red #dc2626, Feed B: Blue #2563eb)
    const pwrA = s.cables.filter(c => c.id.includes('pwr-a'));
    const pwrB = s.cables.filter(c => c.id.includes('pwr-b'));
    expect(pwrA.length).toBeGreaterThan(0);
    expect(pwrB.length).toBeGreaterThan(0);

    for (const ca of pwrA) {
      expect(ca.color).toBe('#dc2626');
      expect(ca.destPortId).toMatch(/^outlet-pdu-hyperv-a-\d+$/);
      const pos = stateManager.getPortWorldPosition(ca.destPortId);
      expect(pos).not.toBeNull();
    }

    for (const cb of pwrB) {
      expect(cb.color).toBe('#2563eb');
      expect(cb.destPortId).toMatch(/^outlet-pdu-hyperv-b-\d+$/);
      const pos = stateManager.getPortWorldPosition(cb.destPortId);
      expect(pos).not.toBeNull();
    }
  });

  it('verifies that long-distance cables route via side vertical cable managers rather than hanging in the center', () => {
    const payload = getTemplatePayloadJson('tpl-hyperv-cluster');
    importJSON(payload);

    const s = stateManager.getState();
    const rack = s.racks[0];

    // Find ToR uplink cables between servers and switch
    const uplinks = s.cables.filter(c => c.id === 'cbl-hv1-tor' || c.id === 'cbl-hv2-tor');
    expect(uplinks.length).toBe(2);

    for (const cable of uplinks) {
      const srcPos = stateManager.getPortWorldPosition(cable.sourcePortId)!;
      const destPos = stateManager.getPortWorldPosition(cable.destPortId)!;
      const anchors = computeSmartRouting(cable, srcPos, destPos);

      expect(anchors.length).toBeGreaterThanOrEqual(2);
      // The vertical trunk should be routed to the left vertical cable manager (outside rack inner rail, X <= rack.x)
      const leftVcmTrunk = anchors.find((pt: any) => pt.x <= rack.x);
      expect(leftVcmTrunk, `Cable ${cable.id} should have a waypoint in the left VCM channel`).toBeDefined();
    }
  });
});
