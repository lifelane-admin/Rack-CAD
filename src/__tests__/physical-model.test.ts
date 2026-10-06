import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicalInfrastructureModel } from '../model/physical-model';
import { USpaceEngine } from '../model/u-space-engine';
import { DeterministicValidator } from '../model/validation-engine';
import { ChangeProposalEngine } from '../model/change-proposal-engine';
import { ArchitectureVersionManager } from '../model/version-control';
import { ExcelExportEngine } from '../model/excel-export-engine';
import { EngineeringDocGenerator } from '../model/doc-generator';
import { InfrastructureCopilotEngine } from '../ai/copilot/copilot-engine';
import { PhysicalRack, PhysicalObject, PhysicalCable, PhysicalPower } from '../model/types';
import { ModelMigrationAdapter } from '../model/adapter';
import { AppState } from '../core/types';

describe('Physical Infrastructure Model & AI Copilot Suite', () => {
  let model: PhysicalInfrastructureModel;

  beforeEach(() => {
    model = new PhysicalInfrastructureModel();
  });

  describe('1. Deterministic U-Space Engine', () => {
    const testRack: PhysicalRack = {
      rackId: 'rack-test-1',
      rackName: 'Test Cabinet 1',
      rackSizeU: 42,
      rackWidth: 600,
      rackDepth: 1070,
      rackHeight: 2000,
      rackPositionX: 0,
      rackPositionY: 0,
      rackPositionZ: 0,
      weightCapacity: 1200,
      powerCapacity: 7400,
      coolingCapacity: 25000,
      usedU: 0,
      freeU: 42,
      reservedU: 0,
      blockedU: 0,
      powerConsumed: 0,
      weightConsumed: 0,
    };

    const server1: PhysicalObject = {
      objectId: 'srv-01',
      objectName: 'Dell PowerEdge R760',
      category: 'compute',
      subCategory: 'Rack Server',
      manufacturer: 'Dell',
      model: 'PowerEdge R760',
      rackId: 'rack-test-1',
      uStart: 10,
      uEnd: 11,
      heightU: 2,
      width: 482.6,
      depth: 750,
      height: 88.9,
      weight: 28,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      rotation: 0,
      powerWatts: 650,
      powerVA: 700,
      psuCount: 2,
      psuRedundancy: '1+1',
      airflowDirection: 'Front-to-Back',
      frontRearOrientation: 'Front',
      status: 'Active',
    };

    it('allows valid placement within rack limits', () => {
      const res = USpaceEngine.validatePlacement(testRack, [], {
        objectId: 'srv-new',
        uStart: 1,
        heightU: 2,
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects placement overflowing rack top (uEnd > rackSizeU)', () => {
      const res = USpaceEngine.validatePlacement(testRack, [], {
        objectId: 'srv-overflow',
        uStart: 42,
        heightU: 2,
      });
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('Rack overflow');
    });

    it('rejects overlapping U placement', () => {
      const res = USpaceEngine.validatePlacement(testRack, [server1], {
        objectId: 'srv-collision',
        uStart: 11, // Overlaps server1 (U10-U11)
        heightU: 2,
      });
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('U collision');
    });

    it('correctly calculates metrics and finds lowest available slot', () => {
      const metrics = USpaceEngine.calculateMetrics(testRack, [server1]);
      expect(metrics.totalU).toBe(42);
      expect(metrics.usedU).toBe(2);
      expect(metrics.freeU).toBe(40);
      expect(metrics.powerWatts).toBe(650);

      const slot = USpaceEngine.findFirstAvailableSlot(testRack, [server1], 2);
      expect(slot).toBe(1); // U1 is free
    });
  });

  describe('2. Canonical Physical Model & Mutation APIs', () => {
    it('creates racks, objects, ports, and cables with strict validation', () => {
      const rackA = model.createRack({
        rackId: 'RACK-A',
        rackName: 'Cabinet A',
        rackSizeU: 42,
      });
      expect(rackA.rackId).toBe('RACK-A');

      const srvRes = model.createObject({
        objectId: 'SRV-01',
        objectName: 'Primary Node 1',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 20,
        uEnd: 21,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });
      expect(srvRes.success).toBe(true);

      // Verify object exists
      expect(model.getObject('SRV-01')?.objectName).toBe('Primary Node 1');
      expect(model.getObjectsInRack('RACK-A')).toHaveLength(1);
    });

    it('moves object to another rack and updates coordinates', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Cabinet A', rackSizeU: 42 });
      model.createRack({ rackId: 'RACK-B', rackName: 'Cabinet B', rackSizeU: 42 });

      model.createObject({
        objectId: 'SRV-01',
        objectName: 'Primary Node 1',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 20,
        uEnd: 21,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });

      const moveRes = model.moveObject('SRV-01', 'RACK-B', 15);
      expect(moveRes.success).toBe(true);

      const movedObj = model.getObject('SRV-01');
      expect(movedObj?.rackId).toBe('RACK-B');
      expect(movedObj?.uStart).toBe(15);
      expect(movedObj?.uEnd).toBe(16);
    });
  });

  describe('3. Deterministic Validation Engine', () => {
    it('detects Single PDU Dependency SPOF when both PSUs terminate on same PDU', () => {
      const rack = {
        rackId: 'RACK-1',
        rackName: 'Rack 1',
        rackSizeU: 42,
        rackWidth: 600,
        rackDepth: 1070,
        rackHeight: 2000,
        rackPositionX: 0,
        rackPositionY: 0,
        rackPositionZ: 0,
        weightCapacity: 1200,
        powerCapacity: 7400,
        coolingCapacity: 25000,
        usedU: 2,
        freeU: 40,
        reservedU: 0,
        blockedU: 0,
        powerConsumed: 500,
        weightConsumed: 25,
      };

      const server: PhysicalObject = {
        objectId: 'SRV-SPOF',
        objectName: 'Host With Single PDU Risk',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-1',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      };

      // Both PSUs connected to PDU-A
      const powerFeeds: PhysicalPower[] = [
        {
          powerId: 'p1',
          objectId: 'SRV-SPOF',
          psuId: '1',
          psuLabel: 'PSU 1',
          cableId: 'c1',
          pduId: 'PDU-A',
          pduSocketId: '1',
          socketType: 'C13',
          powerFeed: 'A',
          powerWatts: 250,
          redundancyStatus: 'spof',
        },
        {
          powerId: 'p2',
          objectId: 'SRV-SPOF',
          psuId: '2',
          psuLabel: 'PSU 2',
          cableId: 'c2',
          pduId: 'PDU-A', // Same PDU!
          pduSocketId: '2',
          socketType: 'C13',
          powerFeed: 'A',
          powerWatts: 250,
          redundancyStatus: 'spof',
        },
      ];

      const findings = DeterministicValidator.validate([rack], [server], [], [], powerFeeds);
      const spofFinding = findings.find(f => f.category === 'power' && f.severity === 'CRITICAL');
      expect(spofFinding).toBeDefined();
      expect(spofFinding?.description).toContain('terminate on the same PDU');
    });

    it('detects HA co-location risk when peer nodes are in the same cabinet', () => {
      const rack = {
        rackId: 'RACK-1',
        rackName: 'Rack 1',
        rackSizeU: 42,
        rackWidth: 600,
        rackDepth: 1070,
        rackHeight: 2000,
        rackPositionX: 0,
        rackPositionY: 0,
        rackPositionZ: 0,
        weightCapacity: 1200,
        powerCapacity: 7400,
        coolingCapacity: 25000,
        usedU: 4,
        freeU: 38,
        reservedU: 0,
        blockedU: 0,
        powerConsumed: 1000,
        weightConsumed: 50,
      };

      const nodeA: PhysicalObject = {
        objectId: 'SRV-01',
        objectName: 'Cluster Node 1',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-1',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
        haPairId: 'SRV-02',
      };

      const nodeB: PhysicalObject = {
        objectId: 'SRV-02',
        objectName: 'Cluster Node 2',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-1', // Same rack as nodeA!
        uStart: 14,
        uEnd: 15,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
        haPairId: 'SRV-01',
      };

      const findings = DeterministicValidator.validate([rack], [nodeA, nodeB], [], [], []);
      const haFinding = findings.find(f => f.category === 'ha');
      expect(haFinding).toBeDefined();
      expect(haFinding?.description).toContain('co-located in the same physical rack');
    });
  });

  describe('4. Change Proposal Engine & Lifecycle', () => {
    it('creates, simulates, and applies a proposal to the physical model upon approval', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Cabinet A', rackSizeU: 42 });
      model.createRack({ rackId: 'RACK-B', rackName: 'Cabinet B', rackSizeU: 42 });

      model.createObject({
        objectId: 'SRV-05',
        objectName: 'Node 5',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 32,
        uEnd: 33,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });

      const proposal = ChangeProposalEngine.createProposal({
        type: 'MOVE_OBJECT',
        objectId: 'SRV-05',
        from: { rackId: 'RACK-A', uStart: 32, uEnd: 33 },
        to: { rackId: 'RACK-B', uStart: 28, uEnd: 29 },
        reason: 'Improve HA failure-domain separation',
      });

      model.registerProposal(proposal);

      // Verify proposal status
      expect(model.getProposals()).toHaveLength(1);
      expect(proposal.status).toBe('proposed');

      // User Approves and Applies
      const applyRes = model.applyProposal(proposal.proposalId);
      expect(applyRes.success).toBe(true);

      // Target object should now be in RACK-B at U28
      const updatedObj = model.getObject('SRV-05');
      expect(updatedObj?.rackId).toBe('RACK-B');
      expect(updatedObj?.uStart).toBe(28);
      expect(proposal.status).toBe('applied');
    });
  });

  describe('5. Architecture Version Control & Semantic Diff', () => {
    it('tracks versions and computes accurate diffs', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Cabinet A', rackSizeU: 42 });
      const snap1 = model.getSnapshot();

      model.createObject({
        objectId: 'SRV-01',
        objectName: 'Primary Node',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });
      const snap2 = model.getSnapshot();

      const diff = ArchitectureVersionManager.diff(snap1, snap2);
      expect(diff.added).toHaveLength(1);
      expect(diff.added[0].objectId).toBe('SRV-01');
      expect(diff.removed).toHaveLength(0);
    });
  });

  describe('6. Engineering Excel Export Engine', () => {
    it('generates multi-sheet SpreadsheetML XML with all mandatory sheets', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Primary Cabinet', rackSizeU: 42 });
      model.createObject({
        objectId: 'SRV-01',
        objectName: 'Hyper-V Host',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });

      const xml = ExcelExportEngine.generateWorkbook(model);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('ss:Name="01_Project_Summary"');
      expect(xml).toContain('ss:Name="02_Architecture_Summary"');
      expect(xml).toContain('ss:Name="03_Rack_Inventory"');
      expect(xml).toContain('ss:Name="Object_Inventory"');
      expect(xml).toContain('ss:Name="Port_Inventory"');
      expect(xml).toContain('ss:Name="Cable_Schedule"');
      expect(xml).toContain('ss:Name="Power_Schedule"');
      expect(xml).toContain('ss:Name="Validation_Report"');
      expect(xml).toContain('ss:Name="BOM"');
      expect(xml).toContain('Dell');
      expect(xml).toContain('R760');
    });

    it('populates AI_Recommendations sheet with rich engineering data and recommendations', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Cabinet A', rackSizeU: 42 });
      const sheets = ExcelExportEngine.generateSheets(model);
      const aiSheet = sheets.find(s => s.name === 'AI_Recommendations');
      expect(aiSheet).toBeDefined();
      expect(aiSheet!.rows.length).toBeGreaterThan(1);
      const headers = aiSheet!.rows[0];
      expect(headers).toContain('RECOMMENDATION ID');
      expect(headers).toContain('RECOMMENDED ACTION');
      expect(headers).toContain('EXPECTED BENEFIT / IMPACT');

      const allText = JSON.stringify(aiSheet!.rows);
      expect(allText).toContain('REC-CAB-01');
      expect(allText).toContain('CABLING & ROUTING');
      expect(allText).toContain('REC-PHY-01');
    });

    it('includes VLAN and Port Group in Cable_Schedule and preserves them during model conversion', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Cabinet A', rackSizeU: 42 });
      model.createObject({
        objectId: 'SRV-01',
        objectName: 'Compute Node 1',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 450,
        powerVA: 500,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });
      model.createObject({
        objectId: 'SW-01',
        objectName: 'ToR Switch 1',
        category: 'network',
        subCategory: 'Switch',
        manufacturer: 'Cisco',
        model: 'Nexus 93180YC-FX',
        rackId: 'RACK-A',
        uStart: 40,
        uEnd: 40,
        heightU: 1,
        width: 482.6,
        depth: 550,
        height: 44.45,
        weight: 10,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 250,
        powerVA: 280,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });
      model.registerPort({
        portId: 'SRV-01-port-1',
        objectId: 'SRV-01',
        portGroup: 'Data',
        portType: 'Ethernet',
        speed: '25GbE',
        connector: 'SFP28',
        physicalPosition: { x: 50, y: 10 },
        label: 'NIC 1',
        purpose: 'Production Data',
        status: 'Available',
      });
      model.registerPort({
        portId: 'SW-01-port-1',
        objectId: 'SW-01',
        portGroup: 'Data',
        portType: 'Ethernet',
        speed: '25GbE',
        connector: 'SFP28',
        physicalPosition: { x: 50, y: 10 },
        label: 'Port 1',
        purpose: 'Access',
        status: 'Available',
      });
      model.connectCable({
        cableId: 'CBL-01',
        sourceObject: 'SRV-01',
        sourcePort: 'SRV-01-port-1',
        destinationObject: 'SW-01',
        destinationPort: 'SW-01-port-1',
        media: 'Fiber',
        speed: '25GbE',
        connectorA: 'SFP28',
        connectorB: 'SFP28',
        length: 3,
        color: '#3b82f6',
        primaryRoute: 'Right VCM',
        rackA: 'RACK-A',
        rackB: 'RACK-A',
        purpose: 'Production',
        vlan: 'VLAN 100 (VM Prod)',
        portGroup: 'dpg-production-vswitch',
        networkRole: 'Production Traffic',
        status: 'connected',
      });

      const sheets = ExcelExportEngine.generateSheets(model);
      const cableSheet = sheets.find(s => s.name === 'Cable_Schedule');
      expect(cableSheet).toBeDefined();
      expect(cableSheet!.rows[0]).toContain('VLAN / SUBNET');
      expect(cableSheet!.rows[0]).toContain('PORT GROUP / ROLE');

      const dataRow = cableSheet!.rows.find(r => r[0] === 'CBL-01');
      expect(dataRow).toBeDefined();
      expect(dataRow).toContain('VLAN 100 (VM Prod)');
      expect(dataRow).toContain('dpg-production-vswitch');
    });

    it('formats raw UUID object IDs, port IDs, and cable IDs as human-readable identifiable names across Excel sheets', () => {
      model.createRack({ rackId: '98d8a295-2da9-4e03-a0f0-66efa92a5ffe', rackName: 'Cabinet 01', rackSizeU: 42 });
      model.createObject({
        objectId: '3d5277a2-1893-4694-b83a-e21c02feae75',
        objectName: 'Primary Compute Node',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: '98d8a295-2da9-4e03-a0f0-66efa92a5ffe',
        uStart: 14,
        uEnd: 15,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 450,
        powerVA: 500,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });
      model.createObject({
        objectId: '990488af-fb42-4ed5-bf17-16c63d32ca80',
        objectName: 'ToR Switch 1',
        category: 'network',
        subCategory: 'Switch',
        manufacturer: 'Cisco',
        model: 'Nexus 93180YC',
        rackId: '98d8a295-2da9-4e03-a0f0-66efa92a5ffe',
        uStart: 40,
        uEnd: 40,
        heightU: 1,
        width: 482.6,
        depth: 550,
        height: 44.45,
        weight: 10,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 250,
        powerVA: 280,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      });
      model.registerPort({
        portId: '3d5277a2-1893-4694-b83a-e21c02feae75-ear-left-nic1',
        objectId: '3d5277a2-1893-4694-b83a-e21c02feae75',
        portGroup: 'Data',
        portType: 'rj45',
        speed: '10GbE',
        connector: 'RJ45',
        physicalPosition: { x: 10, y: 10 },
        label: 'Left Ear Network 1 (RJ45)',
        purpose: 'Host Data Uplink',
        status: 'Connected',
      });
      model.registerPort({
        portId: '990488af-fb42-4ed5-bf17-16c63d32ca80-port-0',
        objectId: '990488af-fb42-4ed5-bf17-16c63d32ca80',
        portGroup: 'Data',
        portType: 'sfp28',
        speed: '10GbE',
        connector: 'SFP28',
        physicalPosition: { x: 50, y: 10 },
        label: 'NIC 1',
        purpose: 'Access Port',
        status: 'Connected',
      });
      model.connectCable({
        cableId: 'b90a34dd-20a3-43a5-ac9f-218b66c06661',
        sourceObject: '3d5277a2-1893-4694-b83a-e21c02feae75',
        sourcePort: '3d5277a2-1893-4694-b83a-e21c02feae75-ear-left-nic1',
        destinationObject: '990488af-fb42-4ed5-bf17-16c63d32ca80',
        destinationPort: '990488af-fb42-4ed5-bf17-16c63d32ca80-port-0',
        media: 'DAC',
        speed: '10GbE',
        connectorA: 'RJ45',
        connectorB: 'SFP28',
        length: 2,
        color: '#3b82f6',
        primaryRoute: 'Left VCM',
        rackA: '98d8a295-2da9-4e03-a0f0-66efa92a5ffe',
        rackB: '98d8a295-2da9-4e03-a0f0-66efa92a5ffe',
        purpose: 'Production',
        status: 'connected',
      });

      const sheets = ExcelExportEngine.generateSheets(model);
      const connSheet = sheets.find(s => s.name === 'Connectivity')!;
      expect(connSheet).toBeDefined();

      const cableRow = connSheet.rows[1];
      // CABLE ID must be formatted as CBL-001 instead of raw UUID
      expect(cableRow[0]).toBe('CBL-001');
      // SOURCE OBJECT must be human-readable name with U position
      expect(cableRow[1]).toBe('Primary Compute Node [U14]');
      // SOURCE PORT must be human-readable port label
      expect(cableRow[2]).toBe('Left Ear Network 1 (RJ45)');
      // DEST OBJECT must be human-readable switch name with U position
      expect(cableRow[3]).toBe('ToR Switch 1 [U40]');
      // DEST PORT must be human-readable port label
      expect(cableRow[4]).toBe('NIC 1');

      // Cable schedule verification
      const schedSheet = sheets.find(s => s.name === 'Cable_Schedule')!;
      const schedRow = schedSheet.rows[1];
      expect(schedRow[0]).toBe('CBL-001');
      expect(schedRow[1]).toBe('Cabinet 01'); // Source rack name instead of UUID
      expect(schedRow[2]).toBe('Primary Compute Node [U14]');
      expect(schedRow[4]).toBe('Cabinet 01'); // Dest rack name instead of UUID
      expect(schedRow[5]).toBe('ToR Switch 1 [U40]');
    });
  });

  describe('7. Document Generation', () => {
    it('generates HLD, LLD, and BOM from physical model', () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Primary Cabinet', rackSizeU: 42 });
      const hld = EngineeringDocGenerator.generateDocument(model, 'HLD');
      expect(hld).toContain('# HIGH LEVEL DESIGN');

      const lld = EngineeringDocGenerator.generateDocument(model, 'LLD');
      expect(lld).toContain('# LOW LEVEL DESIGN');

      const bom = EngineeringDocGenerator.generateDocument(model, 'BOM');
      expect(bom).toContain('# BILL OF MATERIALS');
    });
  });

  describe('8. AI Copilot Queries', () => {
    it('answers SPOF queries against the current physical model without hallucinations', async () => {
      model.createRack({ rackId: 'RACK-A', rackName: 'Cabinet A', rackSizeU: 42 });
      model.createRack({ rackId: 'RACK-B', rackName: 'Cabinet B', rackSizeU: 42 });

      model.createObject({
        objectId: 'NODE-1',
        objectName: 'HA Primary Node',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
        haPairId: 'NODE-2',
      });

      model.createObject({
        objectId: 'NODE-2',
        objectName: 'HA Secondary Node',
        category: 'compute',
        subCategory: 'Server',
        manufacturer: 'Dell',
        model: 'R760',
        rackId: 'RACK-A', // Co-located risk!
        uStart: 14,
        uEnd: 15,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
        haPairId: 'NODE-1',
      });

      const res = await InfrastructureCopilotEngine.query('Find single points of failure in my infrastructure', model);
      expect(res.type).toBe('analysis');
      expect(res.markdown).toContain('HA Pair');
      expect(res.proposals).toBeDefined();
      expect(res.proposals!.length).toBeGreaterThan(0);
      expect(res.proposals![0].type).toBe('MOVE_OBJECT');
    });
  });

  describe('9. False Positive Prevention & DCIM Real-World Validation', () => {
    it('validates 0U vertical PDU without uStart or bounds errors', () => {
      const testRack: PhysicalRack = {
        rackId: 'RACK-01',
        rackName: 'Rack 01',
        rackSizeU: 42,
        rackWidth: 600,
        rackDepth: 1070,
        rackHeight: 2000,
        rackPositionX: 0,
        rackPositionY: 0,
        rackPositionZ: 0,
        weightCapacity: 1200,
        powerCapacity: 7400,
        coolingCapacity: 25000,
        usedU: 0,
        freeU: 42,
        reservedU: 0,
        blockedU: 0,
        powerConsumed: 0,
        weightConsumed: 0,
      };

      const res = USpaceEngine.validatePlacement(testRack, [], {
        objectId: 'vpdu-legrand-01',
        uStart: 0,
        heightU: 0,
        category: 'power',
        subCategory: 'Legrand LCS3 Vertical PDU (India)',
      });

      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('passes server dual PSU power redundancy validation with dual PDUs', () => {
      const rack: PhysicalRack = {
        rackId: 'RACK-01',
        rackName: 'Server Rack',
        rackSizeU: 42,
        rackWidth: 600,
        rackDepth: 1070,
        rackHeight: 2000,
        rackPositionX: 0,
        rackPositionY: 0,
        rackPositionZ: 0,
        weightCapacity: 1200,
        powerCapacity: 7400,
        coolingCapacity: 25000,
        usedU: 2,
        freeU: 40,
        reservedU: 0,
        blockedU: 0,
        powerConsumed: 500,
        weightConsumed: 30,
      };

      const server: PhysicalObject = {
        objectId: 'proxmox-h1',
        objectName: 'Proxmox-H1-BLR',
        category: 'compute',
        subCategory: '2U Server',
        manufacturer: 'Supermicro',
        model: 'SYS-2029U',
        rackId: 'RACK-01',
        uStart: 10,
        uEnd: 11,
        heightU: 2,
        width: 482.6,
        depth: 750,
        height: 88.9,
        weight: 25,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 500,
        powerVA: 550,
        psuCount: 2,
        psuRedundancy: '1+1',
        airflowDirection: 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
      };

      const pduA: PhysicalObject = {
        objectId: 'pdu-left',
        objectName: 'Legrand LCS3 Vertical PDU (Feed A)',
        category: 'power',
        subCategory: 'Vertical PDU',
        manufacturer: 'Legrand',
        model: 'LCS3-IS',
        rackId: 'RACK-01',
        uStart: 0,
        uEnd: 0,
        heightU: 0,
        width: 46,
        depth: 50,
        height: 1800,
        weight: 5.5,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 0,
        powerVA: 0,
        psuCount: 0,
        psuRedundancy: 'None',
        airflowDirection: 'Passive',
        frontRearOrientation: 'Front',
        status: 'Active',
      };

      const pduB: PhysicalObject = {
        objectId: 'pdu-right',
        objectName: 'Legrand LCS3 Vertical PDU (Feed B)',
        category: 'power',
        subCategory: 'Vertical PDU',
        manufacturer: 'Legrand',
        model: 'LCS3-IS',
        rackId: 'RACK-01',
        uStart: 0,
        uEnd: 0,
        heightU: 0,
        width: 46,
        depth: 50,
        height: 1800,
        weight: 5.5,
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: 0,
        powerVA: 0,
        psuCount: 0,
        psuRedundancy: 'None',
        airflowDirection: 'Passive',
        frontRearOrientation: 'Front',
        status: 'Active',
      };

      const powerEntries: PhysicalPower[] = [
        {
          powerId: 'pwr-1',
          objectId: 'proxmox-h1',
          psuId: '1',
          psuLabel: 'PSU 1',
          cableId: 'c-pwr-1',
          pduId: 'pdu-left',
          pduSocketId: 'outlet-left-0',
          socketType: 'C13',
          powerFeed: 'A',
          powerWatts: 250,
          redundancyStatus: 'redundant',
        },
        {
          powerId: 'pwr-2',
          objectId: 'proxmox-h1',
          psuId: '2',
          psuLabel: 'PSU 2',
          cableId: 'c-pwr-2',
          pduId: 'pdu-right',
          pduSocketId: 'outlet-right-0',
          socketType: 'C13',
          powerFeed: 'B',
          powerWatts: 250,
          redundancyStatus: 'redundant',
        },
      ];

      const findings = DeterministicValidator.validate(
        [rack],
        [server, pduA, pduB],
        [],
        [],
        powerEntries
      );

      // Verify no power errors exist for the server
      const powerFindings = findings.filter(f => f.category === 'power');
      expect(powerFindings).toHaveLength(0);
      const criticalFindings = findings.filter(f => f.severity === 'CRITICAL');
      expect(criticalFindings).toHaveLength(0);
    });

    it('end-to-end converts AppState with dual PDU, dual PSU server, and ear data ports without false positives', () => {
      const mockAppState = {
        racks: [
          { id: 'rack-blr', name: 'Production Rack BLR', units: 42, x: 0, y: 0, leftCableManagerWidth: '4-inch', rightCableManagerWidth: '4-inch' }
        ],
        devices: [
          {
            id: 'pdu-left',
            templateId: 'vpdu-legrand-is',
            rackId: 'rack-blr',
            startUnit: 0,
            name: 'Legrand LCS3 Vertical PDU (Feed A)',
            ports: [],
          },
          {
            id: 'pdu-right',
            templateId: 'vpdu-legrand-is',
            rackId: 'rack-blr',
            startUnit: 0,
            name: 'Legrand LCS3 Vertical PDU (Feed B)',
            ports: [],
          },
          {
            id: 'server-proxmox',
            templateId: 'server-2u',
            rackId: 'rack-blr',
            startUnit: 10,
            name: 'Proxmox-H1-BLR',
            powerWatts: 450,
            ports: [
              { id: 'server-proxmox-nic1', name: 'NIC 1', type: 'rj45', relativeX: 320, relativeY: 15, speed: '1 Gbps', connected: false, cableId: null },
              { id: 'server-proxmox-nic2', name: 'NIC 2', type: 'sfp-plus', relativeX: 332, relativeY: 15, speed: '10 Gbps', connected: false, cableId: null },
              { id: 'server-proxmox-nic3', name: 'NIC 3', type: 'sfp-plus', relativeX: 332, relativeY: 27, speed: '10 Gbps', connected: true, cableId: 'cable-data-1' },
              { id: 'server-proxmox-nic4', name: 'NIC 4', type: 'sfp-plus', relativeX: 320, relativeY: 27, speed: '10 Gbps', connected: false, cableId: null },
              { id: 'server-proxmox-ear-left-power', name: 'Left Ear Power', type: 'power', relativeX: -12.5, relativeY: 40, connected: true, cableId: 'c-pwr-a' },
              { id: 'server-proxmox-ear-right-power', name: 'Right Ear Power', type: 'power', relativeX: 362.5, relativeY: 40, connected: true, cableId: 'c-pwr-b' },
              { id: 'server-proxmox-ear-right-nic1', name: 'Right Ear S2-P1', type: 'sfp-plus', relativeX: 362.5, relativeY: 15, speed: '10 Gbps', connected: true, cableId: 'cable-data-1' },
            ],
          },
          {
            id: 'switch-leaf',
            templateId: 'rs-sw-32p',
            rackId: 'rack-blr',
            startUnit: 40,
            name: 'Arista 7050SX3 Leaf Switch',
            ports: [
              { id: 'switch-leaf-sfp-4', name: 'SFP+ 4', type: 'sfp-plus', relativeX: 50, relativeY: 10, speed: '10 Gbps', connected: true, cableId: 'cable-data-1' },
            ],
          },
        ],
        cables: [
          // Power cable A: Left Ear Power -> PDU Left Outlet 1
          {
            id: 'c-pwr-a',
            name: 'PSU 1 Feed A',
            type: 'power',
            color: '#3b82f6',
            sourcePortId: 'server-proxmox-ear-left-power',
            destPortId: 'outlet-pdu-left-0',
            bendPoints: [],
            powerCableType: 'power',
          },
          // Power cable B: Right Ear Power -> PDU Right Outlet 1
          {
            id: 'c-pwr-b',
            name: 'PSU 2 Feed B',
            type: 'power',
            color: '#ef4444',
            sourcePortId: 'server-proxmox-ear-right-power',
            destPortId: 'outlet-pdu-right-0',
            bendPoints: [],
            powerCableType: 'power',
          },
          // 10GbE DAC data cable: Right Ear S2-P1 -> Switch SFP+ 4
          {
            id: 'cable-data-1',
            name: 'Server Uplink 10G',
            type: 'dac-twinax',
            color: '#10b981',
            sourcePortId: 'server-proxmox-ear-right-nic1',
            destPortId: 'switch-leaf-sfp-4',
            bendPoints: [],
          },
        ],
      } as unknown as AppState;

      const convertedModel = ModelMigrationAdapter.fromAppState(mockAppState);

      // Verify physical objects
      const pduObj = convertedModel.objects.find(o => o.objectId === 'pdu-left');
      expect(pduObj).toBeDefined();
      expect(pduObj?.uStart).toBe(0);
      expect(pduObj?.heightU).toBe(0);

      // Verify power mapping has 2 PSUs for Proxmox server on Feed A and Feed B
      const serverPower = convertedModel.power.filter(p => p.objectId === 'server-proxmox');
      expect(serverPower).toHaveLength(2);
      expect(new Set(serverPower.map(p => p.psuId)).size).toBe(2);
      expect(new Set(serverPower.map(p => p.powerFeed)).size).toBe(2);

      // Verify data cable is 10GbE / DAC
      const dataCable = convertedModel.cables.find(c => c.cableId === 'cable-data-1');
      expect(dataCable).toBeDefined();
      expect(dataCable?.media).toBe('DAC');
      expect(dataCable?.speed).toBe('10GbE');

      // Run deterministic validation on the converted model
      const findings = DeterministicValidator.validate(
        convertedModel.racks,
        convertedModel.objects,
        convertedModel.ports,
        convertedModel.cables,
        convertedModel.power
      );

      // Check: zero critical physical, zero power errors, zero speed/media mismatch errors
      const critical = findings.filter(f => f.severity === 'CRITICAL');
      const powerErrors = findings.filter(f => f.category === 'power');
      const networkMismatches = findings.filter(f => f.description.includes('Speed mismatch') || f.description.includes('Media mismatch'));

      expect(critical).toHaveLength(0);
      expect(powerErrors).toHaveLength(0);
      expect(networkMismatches).toHaveLength(0);
    });
  });
});
