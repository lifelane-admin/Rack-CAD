/**
 * Deterministic Infrastructure Validation Engine
 * Validates Physical Model across Physical, Network, Power, Storage, HA, and Cooling rules.
 */

import {
  PhysicalRack,
  PhysicalObject,
  PhysicalPort,
  PhysicalCable,
  PhysicalPower,
  ValidationFinding,
} from './types';
import { USpaceEngine } from './u-space-engine';

export class DeterministicValidator {
  /**
   * Runs the complete deterministic validation suite on the physical infrastructure model.
   */
  static validate(
    racks: PhysicalRack[],
    objects: PhysicalObject[],
    ports: PhysicalPort[],
    cables: PhysicalCable[],
    power: PhysicalPower[]
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    let counter = 1;
    const nextId = () => `F-${String(counter++).padStart(3, '0')}`;

    // Index lookups
    const rackMap = new Map<string, PhysicalRack>(racks.map(r => [r.rackId, r]));
    const objectMap = new Map<string, PhysicalObject>(objects.map(o => [o.objectId, o]));
    const portMap = new Map<string, PhysicalPort>(ports.map(p => [p.portId, p]));

    // ==========================================
    // 1. PHYSICAL VALIDATION
    // ==========================================
    for (const rack of racks) {
      const objectsInRack = objects.filter(o => o.rackId === rack.rackId);
      const metrics = USpaceEngine.calculateMetrics(rack, objectsInRack);

      // Check rack overflow & collisions
      for (const obj of objectsInRack) {
        // Skip 0U vertical equipment (e.g., vertical side-mount PDUs, 0U cable managers)
        if (
          obj.heightU === 0 ||
          obj.uStart === 0 ||
          obj.subCategory?.toLowerCase().includes('vertical') ||
          (obj.category === 'power' && obj.uStart === 0) ||
          obj.notes?.toLowerCase().includes('0u') ||
          obj.notes?.toLowerCase().includes('side-mount')
        ) {
          continue;
        }

        const uRes = USpaceEngine.validatePlacement(rack, objects, {
          objectId: obj.objectId,
          uStart: obj.uStart,
          heightU: obj.heightU,
          category: obj.category,
          subCategory: obj.subCategory,
        });

        for (const err of uRes.errors) {
          findings.push({
            findingId: nextId(),
            severity: 'CRITICAL',
            category: 'physical',
            objectId: obj.objectId,
            rackId: rack.rackId,
            affectedObjectIds: [obj.objectId],
            description: err,
            impact: 'Equipment cannot physically mount or collides with adjacent hardware.',
            recommendation: 'Relocate equipment to unoccupied rack units within valid bounds.',
            status: 'open',
          });
        }
      }

      // Check rack weight capacity
      if (rack.weightCapacity > 0 && metrics.weightKg > rack.weightCapacity) {
        findings.push({
          findingId: nextId(),
          severity: 'HIGH',
          category: 'physical',
          rackId: rack.rackId,
          affectedObjectIds: objectsInRack.map(o => o.objectId),
          description: `Rack ${rack.rackName} exceeds weight capacity (${metrics.weightKg}kg / ${rack.weightCapacity}kg limit).`,
          impact: 'Structural frame damage or floor loading limit violations.',
          recommendation: 'Redistribute heavy chassis across adjacent cabinets.',
          status: 'open',
        });
      }
    }

    // ==========================================
    // 2. POWER & REDUNDANCY VALIDATION
    // ==========================================
    for (const obj of objects) {
      // For active compute, storage, or network devices
      if (['compute', 'storage', 'network', 'routing', 'security'].includes(obj.category)) {
        const objPower = power.filter(p => p.objectId === obj.objectId);

        // Check PSU connection completeness
        if (obj.psuCount > 1 && objPower.length < obj.psuCount) {
          findings.push({
            findingId: nextId(),
            severity: 'HIGH',
            category: 'power',
            objectId: obj.objectId,
            rackId: obj.rackId,
            affectedObjectIds: [obj.objectId],
            description: `${obj.objectName} has ${obj.psuCount} power supplies, but only ${objPower.length} power cables connected.`,
            impact: 'Loss of hardware power redundancy; single PSU failure shuts down host.',
            recommendation: `Connect remaining PSU to redundant PDU circuit.`,
            status: 'open',
          });
        }

        // Check Single PDU Dependency (Both PSUs on same PDU)
        if (objPower.length >= 2) {
          const distinctPdus = new Set(objPower.map(p => p.pduId));
          if (distinctPdus.size === 1) {
            findings.push({
              findingId: nextId(),
              severity: 'CRITICAL',
              category: 'power',
              objectId: obj.objectId,
              rackId: obj.rackId,
              affectedObjectIds: [obj.objectId, ...Array.from(distinctPdus)],
              description: `${obj.objectName} has multiple power supplies, but all terminate on the same PDU (${Array.from(distinctPdus)[0]}).`,
              impact: 'Single Point of Failure: PDU maintenance or trip causes immediate outage for this system.',
              recommendation: 'Separate PSU feeds across PDU-A and PDU-B on isolated feeds.',
              status: 'open',
            });
          }

          // Check Feed Diversity (Feed A and Feed B)
          const feeds = new Set(objPower.map(p => p.powerFeed));
          if (feeds.size === 1 && (feeds.has('A') || feeds.has('B'))) {
            findings.push({
              findingId: nextId(),
              severity: 'MEDIUM',
              category: 'power',
              objectId: obj.objectId,
              rackId: obj.rackId,
              affectedObjectIds: [obj.objectId],
              description: `${obj.objectName} is connected to separate PDUs, but both PDUs share Feed ${Array.from(feeds)[0]}.`,
              impact: 'Utility feed interruption or upstream UPS maintenance will de-energize both circuits.',
              recommendation: 'Balance feeds across Feed A and Feed B power lines.',
              status: 'open',
            });
          }
        }
      }
    }

    // PDU Overload Checks
    const pduMap = new Map<string, { totalWatts: number; rackId: string }>();
    for (const pwr of power) {
      const cur = pduMap.get(pwr.pduId) || { totalWatts: 0, rackId: '' };
      cur.totalWatts += pwr.powerWatts || 0;
      const dev = objectMap.get(pwr.objectId);
      if (dev) cur.rackId = dev.rackId;
      pduMap.set(pwr.pduId, cur);
    }

    const PDU_CAPACITY_DEFAULT = 7400; // 32A @ 230V standard ~ 7.4kW
    for (const [pduId, pduData] of pduMap.entries()) {
      if (pduData.totalWatts > PDU_CAPACITY_DEFAULT) {
        findings.push({
          findingId: nextId(),
          severity: 'CRITICAL',
          category: 'power',
          rackId: pduData.rackId,
          affectedObjectIds: [pduId],
          description: `PDU ${pduId} is overloaded: connected load is ${pduData.totalWatts}W (rated max ${PDU_CAPACITY_DEFAULT}W).`,
          impact: 'Breaker trip risk and loss of rack power.',
          recommendation: 'Rebalance high-density servers to adjacent PDU or rack.',
          status: 'open',
        });
      } else if (pduData.totalWatts > PDU_CAPACITY_DEFAULT * 0.8) {
        findings.push({
          findingId: nextId(),
          severity: 'LOW',
          category: 'power',
          rackId: pduData.rackId,
          affectedObjectIds: [pduId],
          description: `PDU ${pduId} is at 80%+ threshold (${pduData.totalWatts}W of ${PDU_CAPACITY_DEFAULT}W).`,
          impact: 'Approaching derated safety capacity under continuous load.',
          recommendation: 'Monitor capacity during peak server CPU/GPU load.',
          status: 'open',
        });
      }
    }

    // ==========================================
    // 3. NETWORK & CABLING VALIDATION
    // ==========================================
    for (const cable of cables) {
      const srcPort = portMap.get(cable.sourcePort);
      const destPort = portMap.get(cable.destinationPort);

      if (!srcPort || !destPort) {
        findings.push({
          findingId: nextId(),
          severity: 'INFO',
          category: 'network',
          affectedObjectIds: [cable.cableId],
          description: `Cable ${cable.cableId} (${cable.purpose}) has an unresolved or disconnected endpoint.`,
          impact: 'Dangling cable without complete circuit path.',
          recommendation: 'Terminate both ends on valid device ports or remove unused run.',
          status: 'open',
        });
        continue;
      }

      // Skip power connections from network media and speed mismatch validation
      if (
        cable.media === 'Power' ||
        cable.purpose === 'Power' ||
        srcPort.portType === 'power' ||
        destPort.portType === 'power' ||
        srcPort.portGroup === 'Power' ||
        destPort.portGroup === 'Power'
      ) {
        continue;
      }

      // Connector compatibility
      if (cable.media === 'Fiber' && (srcPort.connector === 'RJ45' || destPort.connector === 'RJ45')) {
        findings.push({
          findingId: nextId(),
          severity: 'CRITICAL',
          category: 'network',
          affectedObjectIds: [srcPort.objectId, destPort.objectId, cable.cableId],
          description: `Media mismatch on cable ${cable.cableId}: Fiber cable cannot plug into RJ45 connector.`,
          impact: 'Physical insertion failure; link will not establish.',
          recommendation: 'Use transceivers (SFP/SFP+) or copper patch cable.',
          status: 'open',
        });
      }

      // Speed mismatch warning (exclude management and auto-negotiation compatibility)
      if (
        srcPort.speed &&
        destPort.speed &&
        srcPort.speed !== destPort.speed &&
        srcPort.speed !== 'Management' &&
        destPort.speed !== 'Management' &&
        srcPort.speed !== 'Power' &&
        destPort.speed !== 'Power'
      ) {
        findings.push({
          findingId: nextId(),
          severity: 'MEDIUM',
          category: 'network',
          affectedObjectIds: [srcPort.objectId, destPort.objectId],
          description: `Speed mismatch between ${srcPort.label} (${srcPort.speed}) and ${destPort.label} (${destPort.speed}).`,
          impact: 'Link will negotiate down to lower speed or fail to sync.',
          recommendation: 'Verify port transceiver compatibility and auto-negotiation configuration.',
          status: 'open',
        });
      }
    }

    // ToR Switch Diversity (Check if compute nodes connect to single ToR switch)
    const computeNodes = objects.filter(o => o.category === 'compute');
    for (const node of computeNodes) {
      const nodePorts = ports.filter(p => p.objectId === node.objectId && p.portGroup === 'Data');
      const connectedSwitches = new Set<string>();

      for (const p of nodePorts) {
        const c = cables.find(cab => cab.sourcePort === p.portId || cab.destinationPort === p.portId);
        if (c) {
          const remotePortId = c.sourcePort === p.portId ? c.destinationPort : c.sourcePort;
          const remotePort = portMap.get(remotePortId);
          if (remotePort) {
            const remoteDev = objectMap.get(remotePort.objectId);
            if (remoteDev && remoteDev.category === 'network') {
              connectedSwitches.add(remoteDev.objectId);
            }
          }
        }
      }

      if (connectedSwitches.size === 1) {
        const switchId = Array.from(connectedSwitches)[0];
        const switchObj = objectMap.get(switchId);
        findings.push({
          findingId: nextId(),
          severity: 'HIGH',
          category: 'network',
          objectId: node.objectId,
          rackId: node.rackId,
          affectedObjectIds: [node.objectId, switchId],
          description: `${node.objectName} has all network data uplinks terminating on a single switch (${switchObj?.objectName || switchId}).`,
          impact: 'Single ToR failure isolates host from production fabric.',
          recommendation: 'Connect secondary NIC interface to redundant Top-of-Rack switch (ToR-B).',
          status: 'open',
        });
      } else if (connectedSwitches.size === 0 && nodePorts.length > 0) {
        findings.push({
          findingId: nextId(),
          severity: 'MEDIUM',
          category: 'network',
          objectId: node.objectId,
          rackId: node.rackId,
          affectedObjectIds: [node.objectId],
          description: `${node.objectName} has unconfigured data ports without network uplinks.`,
          impact: 'Host is physically isolated from the network.',
          recommendation: 'Patch data uplinks to Top-of-Rack switch.',
          status: 'open',
        });
      }
    }

    // ==========================================
    // 4. HIGH AVAILABILITY & FAILURE DOMAIN
    // ==========================================
    for (const obj of objects) {
      if (obj.haPairId) {
        const peer = objectMap.get(obj.haPairId);
        if (peer && peer.objectId > obj.objectId) {
          // Check if HA pair is physically mounted in the same rack
          if (obj.rackId === peer.rackId) {
            const rk = rackMap.get(obj.rackId);
            findings.push({
              findingId: nextId(),
              severity: 'HIGH',
              category: 'ha',
              objectId: obj.objectId,
              rackId: obj.rackId,
              affectedObjectIds: [obj.objectId, peer.objectId],
              description: `HA Pair (${obj.objectName} and ${peer.objectName}) are co-located in the same physical rack (${rk?.rackName || obj.rackId}).`,
              impact: 'Rack-level failure domain violation: Rack power, PDU or physical maintenance impacts both cluster nodes.',
              recommendation: `Move ${peer.objectName} to a separate cabinet (e.g. Rack B) for true physical fault isolation.`,
              status: 'open',
            });
          }

          // Check if HA pair shares identical failure domain
          if (obj.failureDomain && peer.failureDomain && obj.failureDomain === peer.failureDomain) {
            findings.push({
              findingId: nextId(),
              severity: 'MEDIUM',
              category: 'ha',
              objectId: obj.objectId,
              affectedObjectIds: [obj.objectId, peer.objectId],
              description: `HA Pair (${obj.objectName} and ${peer.objectName}) belong to the same failure domain (${obj.failureDomain}).`,
              impact: 'Common mode failure risk across shared upstream infrastructure.',
              recommendation: `Assign ${peer.objectName} to an alternate failure domain / availability zone.`,
              status: 'open',
            });
          }
        }
      }
    }

    // ==========================================
    // 5. COOLING & THERMAL DENSITY
    // ==========================================
    for (const rack of racks) {
      const objectsInRack = objects.filter(o => o.rackId === rack.rackId);
      const totalWatts = objectsInRack.reduce((acc, o) => acc + (o.powerWatts || 0), 0);

      if (totalWatts > 15000) {
        findings.push({
          findingId: nextId(),
          severity: 'HIGH',
          category: 'cooling',
          rackId: rack.rackId,
          affectedObjectIds: objectsInRack.map(o => o.objectId),
          description: `High thermal density: Rack ${rack.rackName} dissipates ${(totalWatts / 1000).toFixed(1)}kW (>15kW threshold).`,
          impact: 'Hot air recirculation, hotspot risk, and potential thermal throttling.',
          recommendation: 'Implement in-row cooling or cold-aisle containment for this cabinet.',
          status: 'open',
        });
      }
    }

    return findings;
  }
}
