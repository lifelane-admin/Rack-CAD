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
});
