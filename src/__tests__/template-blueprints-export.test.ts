import { describe, it, expect, beforeEach } from 'vitest';
import { ARCHITECTURE_TEMPLATES, projectStore } from '../storage/project-store';
import { getTemplatePayloadJson } from '../storage/template-data-generator';
import { importJSON } from '../utils/export';
import { stateManager } from '../core/state';
import { ExcelExportEngine } from '../model/excel-export-engine';
import { physicalInfrastructureModel } from '../model/physical-model';

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
});
