/**
 * Canonical Physical Infrastructure Model Store
 * The authoritative, deterministic single source of truth for RackSlicer infrastructure.
 */

import {
  Project,
  Site,
  Room,
  PhysicalRack,
  PhysicalObject,
  PhysicalPort,
  PhysicalConnection,
  PhysicalCable,
  PhysicalPower,
  PhysicalFailureDomain,
  ChangeProposal,
  ValidationFinding,
  AIRequestContext,
  PhysicalModelSnapshot,
} from './types';
import { USpaceEngine } from './u-space-engine';
import { DeterministicValidator } from './validation-engine';
import { ChangeProposalEngine } from './change-proposal-engine';
import { ArchitectureVersionManager } from './version-control';
import { architectureEvents } from './events';

export class PhysicalInfrastructureModel {
  private project: Project;
  private site?: Site;
  private room?: Room;
  private racks = new Map<string, PhysicalRack>();
  private objects = new Map<string, PhysicalObject>();
  private ports = new Map<string, PhysicalPort>();
  private connections = new Map<string, PhysicalConnection>();
  private cables = new Map<string, PhysicalCable>();
  private power = new Map<string, PhysicalPower>();
  private failureDomains = new Map<string, PhysicalFailureDomain>();
  private proposals = new Map<string, ChangeProposal>();

  private versionManager: ArchitectureVersionManager;

  constructor() {
    this.project = {
      projectId: 'proj-001',
      projectName: 'Datacenter Infrastructure Architecture',
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      version: '1.0.0',
      status: 'draft',
    };

    this.versionManager = new ArchitectureVersionManager(this.getSnapshot(), 'System');
  }

  // ==========================================
  // QUERY / ACCESSOR METHODS
  // ==========================================

  getProject(): Project {
    return { ...this.project };
  }

  setProject(project: Partial<Project>): void {
    this.project = { ...this.project, ...project, modifiedDate: new Date().toISOString() };
  }

  getSite(): Site | undefined {
    return this.site ? { ...this.site } : undefined;
  }

  getRoom(): Room | undefined {
    return this.room ? { ...this.room } : undefined;
  }

  getRacks(): PhysicalRack[] {
    return Array.from(this.racks.values()).map(r => ({
      ...r,
      ...USpaceEngine.calculateMetrics(r, this.getObjectsInRack(r.rackId)),
    }));
  }

  getRack(rackId: string): PhysicalRack | undefined {
    const r = this.racks.get(rackId);
    if (!r) return undefined;
    return {
      ...r,
      ...USpaceEngine.calculateMetrics(r, this.getObjectsInRack(r.rackId)),
    };
  }

  getObjects(): PhysicalObject[] {
    return Array.from(this.objects.values());
  }

  getObject(objectId: string): PhysicalObject | undefined {
    return this.objects.get(objectId);
  }

  getObjectsInRack(rackId: string): PhysicalObject[] {
    return Array.from(this.objects.values()).filter(o => o.rackId === rackId);
  }

  getPorts(objectId?: string): PhysicalPort[] {
    const all = Array.from(this.ports.values());
    return objectId ? all.filter(p => p.objectId === objectId) : all;
  }

  getPort(portId: string): PhysicalPort | undefined {
    return this.ports.get(portId);
  }

  getCables(): PhysicalCable[] {
    return Array.from(this.cables.values());
  }

  getCable(cableId: string): PhysicalCable | undefined {
    return this.cables.get(cableId);
  }

  getPowerMappings(objectId?: string): PhysicalPower[] {
    const all = Array.from(this.power.values());
    return objectId ? all.filter(p => p.objectId === objectId) : all;
  }

  getFailureDomains(): PhysicalFailureDomain[] {
    return Array.from(this.failureDomains.values());
  }

  getProposals(): ChangeProposal[] {
    return Array.from(this.proposals.values());
  }

  getVersionManager(): ArchitectureVersionManager {
    return this.versionManager;
  }

  // ==========================================
  // MUTATION APIS (WITH DETERMINISTIC VALIDATION)
  // ==========================================

  createRack(data: Partial<PhysicalRack> & { rackId: string; rackName: string; rackSizeU: number }): PhysicalRack {
    const rack: PhysicalRack = {
      rackId: data.rackId,
      rackName: data.rackName,
      rackSizeU: data.rackSizeU,
      rackWidth: data.rackWidth ?? 600,
      rackDepth: data.rackDepth ?? 1070,
      rackHeight: data.rackHeight ?? 2000,
      rackPositionX: data.rackPositionX ?? 0,
      rackPositionY: data.rackPositionY ?? 0,
      rackPositionZ: data.rackPositionZ ?? 0,
      weightCapacity: data.weightCapacity ?? 1200,
      powerCapacity: data.powerCapacity ?? 7400,
      coolingCapacity: data.coolingCapacity ?? 25000,
      usedU: 0,
      freeU: data.rackSizeU,
      reservedU: 0,
      blockedU: 0,
      powerConsumed: 0,
      weightConsumed: 0,
      failureDomain: data.failureDomain,
      frontOrientation: data.frontOrientation ?? 'North',
      rearOrientation: data.rearOrientation ?? 'South',
      notes: data.notes,
    };

    this.racks.set(rack.rackId, rack);
    architectureEvents.emit('RACK_CHANGED', { rack });
    this.recordChange(`Created rack ${rack.rackName}`);
    return rack;
  }

  removeRack(rackId: string): void {
    // Cascade remove contained objects
    const objectsInRack = this.getObjectsInRack(rackId);
    for (const obj of objectsInRack) {
      this.removeObject(obj.objectId);
    }
    this.racks.delete(rackId);
    architectureEvents.emit('RACK_DELETED', { rackId });
    this.recordChange(`Removed rack ${rackId}`);
  }

  createObject(data: PhysicalObject): { success: boolean; object?: PhysicalObject; errors: string[] } {
    const rack = this.racks.get(data.rackId);
    if (!rack) {
      return { success: false, errors: [`Target rack ${data.rackId} does not exist.`] };
    }

    const uValidation = USpaceEngine.validatePlacement(rack, this.getObjects(), {
      objectId: data.objectId,
      uStart: data.uStart,
      heightU: data.heightU,
    });

    if (!uValidation.valid) {
      return { success: false, errors: uValidation.errors };
    }

    this.objects.set(data.objectId, data);
    architectureEvents.emit('OBJECT_CREATED', { object: data });
    this.recordChange(`Created object ${data.objectName} in ${rack.rackName} at U${data.uStart}-U${data.uEnd}`);
    return { success: true, object: data, errors: [] };
  }

  moveObject(objectId: string, targetRackId: string, targetU: number): { success: boolean; errors: string[] } {
    const obj = this.objects.get(objectId);
    if (!obj) {
      return { success: false, errors: [`Object ${objectId} not found.`] };
    }

    const targetRack = this.racks.get(targetRackId);
    if (!targetRack) {
      return { success: false, errors: [`Target rack ${targetRackId} does not exist.`] };
    }

    const uValidation = USpaceEngine.validatePlacement(targetRack, this.getObjects(), {
      objectId,
      uStart: targetU,
      heightU: obj.heightU,
    });

    if (!uValidation.valid) {
      return { success: false, errors: uValidation.errors };
    }

    const fromRack = obj.rackId;
    const fromU = obj.uStart;

    obj.rackId = targetRackId;
    obj.uStart = targetU;
    obj.uEnd = targetU + obj.heightU - 1;

    // Update associated cable rack references if moving inter-rack
    if (fromRack !== targetRackId) {
      for (const cable of this.cables.values()) {
        if (cable.sourceObject === objectId) cable.rackA = targetRackId;
        if (cable.destinationObject === objectId) cable.rackB = targetRackId;
      }
    }

    architectureEvents.emit('OBJECT_MOVED', {
      objectId,
      fromRack,
      fromU,
      toRack: targetRackId,
      toU: targetU,
    });

    this.recordChange(`Moved ${obj.objectName} from ${fromRack}:U${fromU} to ${targetRackId}:U${targetU}`);
    return { success: true, errors: [] };
  }

  removeObject(objectId: string): void {
    const obj = this.objects.get(objectId);
    if (!obj) return;

    // Remove associated ports
    for (const [pId, p] of this.ports.entries()) {
      if (p.objectId === objectId) {
        this.ports.delete(pId);
      }
    }

    // Remove cables terminating on this object
    for (const [cId, c] of this.cables.entries()) {
      if (c.sourceObject === objectId || c.destinationObject === objectId) {
        this.cables.delete(cId);
        architectureEvents.emit('CABLE_DELETED', { cableId: cId });
      }
    }

    // Remove power feeds
    for (const [pwrId, pwr] of this.power.entries()) {
      if (pwr.objectId === objectId) {
        this.power.delete(pwrId);
      }
    }

    this.objects.delete(objectId);
    architectureEvents.emit('OBJECT_DELETED', { objectId });
    this.recordChange(`Removed object ${obj.objectName} (${objectId})`);
  }

  registerPort(port: PhysicalPort): void {
    this.ports.set(port.portId, port);
    architectureEvents.emit('PORT_CREATED', { port });
  }

  connectCable(cable: PhysicalCable): { success: boolean; errors: string[] } {
    const srcPort = this.ports.get(cable.sourcePort);
    const destPort = this.ports.get(cable.destinationPort);

    if (!srcPort || !destPort) {
      return { success: false, errors: ['Source or destination port does not exist.'] };
    }

    this.cables.set(cable.cableId, cable);
    srcPort.status = 'Connected';
    destPort.status = 'Connected';

    architectureEvents.emit('CABLE_CREATED', { cable });
    architectureEvents.emit('PORT_CONNECTED', {
      sourcePortId: srcPort.portId,
      destPortId: destPort.portId,
      cableId: cable.cableId,
    });

    this.recordChange(`Connected cable ${cable.cableId} (${srcPort.label} -> ${destPort.label})`);
    return { success: true, errors: [] };
  }

  removeCable(cableId: string): void {
    const cable = this.cables.get(cableId);
    if (!cable) return;

    const srcPort = this.ports.get(cable.sourcePort);
    const destPort = this.ports.get(cable.destinationPort);
    if (srcPort) srcPort.status = 'Available';
    if (destPort) destPort.status = 'Available';

    this.cables.delete(cableId);
    architectureEvents.emit('CABLE_DELETED', { cableId });
    this.recordChange(`Removed cable ${cableId}`);
  }

  mapPower(powerItem: PhysicalPower): void {
    this.power.set(powerItem.powerId, powerItem);
    architectureEvents.emit('POWER_MAPPING_CHANGED', { power: powerItem });
    this.recordChange(`Mapped power for ${powerItem.objectId} PSU-${powerItem.psuId} to PDU ${powerItem.pduId}`);
  }

  // ==========================================
  // VALIDATION & AI CONTEXT
  // ==========================================

  validate(): ValidationFinding[] {
    const findings = DeterministicValidator.validate(
      this.getRacks(),
      this.getObjects(),
      this.getPorts(),
      this.getCables(),
      this.getPowerMappings()
    );
    architectureEvents.emit('VALIDATION_COMPLETED', { findings });
    return findings;
  }

  /**
   * Normalizes current authoritative physical model into the isolated AI request context payload.
   * Completely eliminates reliance on stale conversation history.
   */
  getAIRequestContext(userRequest: string): AIRequestContext {
    const findings = this.validate();
    const haRelationships: { primaryId: string; secondaryId: string; type: string }[] = [];

    for (const obj of this.objects.values()) {
      if (obj.haPairId && obj.objectId < obj.haPairId) {
        haRelationships.push({
          primaryId: obj.objectId,
          secondaryId: obj.haPairId,
          type: 'HA_PAIR',
        });
      }
    }

    return {
      project: this.getProject(),
      racks: this.getRacks(),
      objects: this.getObjects(),
      ports: this.getPorts(),
      connections: Array.from(this.connections.values()),
      cables: this.getCables(),
      power: this.getPowerMappings(),
      haRelationships,
      failureDomains: this.getFailureDomains(),
      validationResults: findings,
      userRequest,
    };
  }

  // ==========================================
  // CHANGE PROPOSAL LIFECYCLE
  // ==========================================

  registerProposal(proposal: ChangeProposal): void {
    this.proposals.set(proposal.proposalId, proposal);
    architectureEvents.emit('AI_PROPOSAL_CREATED', { proposal });
  }

  applyProposal(proposalId: string): { success: boolean; errors: string[] } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return { success: false, errors: [`Proposal ${proposalId} not found.`] };
    }

    const sim = ChangeProposalEngine.simulateProposal(
      proposal,
      this.getRacks(),
      this.getObjects(),
      this.getCables(),
      this.getPowerMappings()
    );

    if (!sim.valid) {
      return { success: false, errors: sim.errors };
    }

    if (proposal.type === 'MOVE_OBJECT') {
      const res = this.moveObject(proposal.objectId, proposal.to?.rackId, proposal.to?.uStart);
      if (!res.success) return res;
    }

    proposal.status = 'applied';
    architectureEvents.emit('AI_PROPOSAL_APPROVED', { proposal });
    this.recordChange(`Applied proposal ${proposal.proposalId}: ${proposal.reason}`, proposal.proposalId);
    return { success: true, errors: [] };
  }

  rejectProposal(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return;
    proposal.status = 'rejected';
    architectureEvents.emit('AI_PROPOSAL_REJECTED', { proposal });
  }

  // ==========================================
  // SNAPSHOT & PERSISTENCE
  // ==========================================

  getSnapshot(): PhysicalModelSnapshot {
    return {
      project: this.getProject(),
      site: this.getSite(),
      room: this.getRoom(),
      racks: this.getRacks(),
      objects: this.getObjects(),
      ports: this.getPorts(),
      connections: Array.from(this.connections.values()),
      cables: this.getCables(),
      power: this.getPowerMappings(),
      failureDomains: this.getFailureDomains(),
      proposals: this.getProposals(),
    };
  }

  loadSnapshot(snapshot: PhysicalModelSnapshot): void {
    this.project = snapshot.project;
    this.site = snapshot.site;
    this.room = snapshot.room;

    this.racks.clear();
    for (const r of snapshot.racks) this.racks.set(r.rackId, r);

    this.objects.clear();
    for (const o of snapshot.objects) this.objects.set(o.objectId, o);

    this.ports.clear();
    for (const p of snapshot.ports) this.ports.set(p.portId, p);

    this.connections.clear();
    for (const c of snapshot.connections) this.connections.set(c.connectionId, c);

    this.cables.clear();
    for (const cb of snapshot.cables) this.cables.set(cb.cableId, cb);

    this.power.clear();
    for (const pwr of snapshot.power) this.power.set(pwr.powerId, pwr);

    this.failureDomains.clear();
    for (const fd of snapshot.failureDomains) this.failureDomains.set(fd.domainId, fd);

    if (snapshot.proposals && snapshot.proposals.length > 0) {
      this.proposals.clear();
      for (const prop of snapshot.proposals) this.proposals.set(prop.proposalId, prop);
    }

    architectureEvents.emit('ARCHITECTURE_UPDATED', { timestamp: new Date().toISOString() });
    this.validate();
  }

  private recordChange(description: string, proposalId?: string): void {
    this.project.modifiedDate = new Date().toISOString();
    this.versionManager.commitVersion({
      author: 'User',
      description,
      proposalId,
      snapshot: this.getSnapshot(),
    });
    architectureEvents.emit('ARCHITECTURE_UPDATED', { timestamp: new Date().toISOString() });
  }
}

// Global Singleton Instance
export const physicalInfrastructureModel = new PhysicalInfrastructureModel();
