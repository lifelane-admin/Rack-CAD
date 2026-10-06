/**
 * Migration & Synchronization Adapter
 * Connects the legacy AppState (RackData, DeviceData, CableData) with the canonical
 * Physical Infrastructure Model without breaking existing 2D/3D renderers or saved projects.
 */

import { AppState, RackData, DeviceData, CableData, PortData } from '../core/types';
import { getTemplate } from '../library/device-catalog';
import {
  PhysicalRack,
  PhysicalObject,
  PhysicalPort,
  PhysicalCable,
  PhysicalPower,
  PhysicalModelSnapshot,
  ObjectCategory,
  PortSpeed,
  ConnectorType,
} from './types';
import { PhysicalInfrastructureModel, physicalInfrastructureModel } from './physical-model';

export class ModelMigrationAdapter {
  /**
   * Converts existing AppState into a canonical Physical Infrastructure Model snapshot.
   */
  static fromAppState(appState: AppState): PhysicalModelSnapshot {
    const racks: PhysicalRack[] = (appState.racks || []).map(r => ({
      rackId: r.id,
      rackName: r.name,
      rackSizeU: r.units,
      rackWidth: r.rackWidth === '23-inch' ? 800 : 600,
      rackDepth: r.depthMm ?? 1070,
      rackHeight: r.units * 44.45 + 150,
      rackPositionX: r.x,
      rackPositionY: r.y,
      rackPositionZ: 0,
      weightCapacity: 1200,
      powerCapacity: r.pduCapacityWatts ? r.pduCapacityWatts * 2 : 7400,
      coolingCapacity: 25000,
      usedU: 0,
      freeU: r.units,
      reservedU: 0,
      blockedU: 0,
      powerConsumed: 0,
      weightConsumed: 0,
      failureDomain: r.id.includes('rack-2') || r.id.includes('rack-b') ? 'Rack B' : 'Rack A',
      frontOrientation: 'North',
      rearOrientation: 'South',
      notes: r.rackType,
    }));

    const objects: PhysicalObject[] = [];
    const ports: PhysicalPort[] = [];
    const cables: PhysicalCable[] = [];
    const power: PhysicalPower[] = [];

    // Map devices to PhysicalObjects
    for (const d of appState.devices || []) {
      const tmpl = getTemplate(d.templateId);
      const isZeroU =
        tmpl?.heightUnits === 0 ||
        tmpl?.mountType === 'side' ||
        d.startUnit === 0 ||
        tmpl?.name?.toLowerCase().includes('vertical') ||
        d.name?.toLowerCase().includes('vertical pdu');
      const heightU = isZeroU ? 0 : (tmpl ? tmpl.heightUnits : 1);
      const inferredCategory = tmpl?.category ||
        (d.name?.toLowerCase().includes('switch') ? 'switch' :
         d.name?.toLowerCase().includes('router') ? 'router' :
         d.name?.toLowerCase().includes('firewall') ? 'firewall' :
         d.name?.toLowerCase().includes('pdu') ? 'pdu' :
         d.name?.toLowerCase().includes('storage') || d.name?.toLowerCase().includes('san') || d.name?.toLowerCase().includes('nas') ? 'storage' :
         'compute');
      const category: ObjectCategory = this.mapCategory(inferredCategory);

      const obj: PhysicalObject = {
        objectId: d.id,
        objectName: d.name || tmpl?.name || d.id,
        category,
        subCategory: tmpl?.name || (isZeroU ? 'Vertical PDU' : 'Standard Equipment'),
        manufacturer: tmpl?.manufacturer || (isZeroU ? 'Legrand' : 'Standard OEM'),
        model: tmpl?.model || tmpl?.name || 'Enterprise Chassis',
        serialNumber: d.serialNumber || `SN-${d.id.toUpperCase()}`,
        rackId: d.rackId,
        uStart: isZeroU ? 0 : d.startUnit,
        uEnd: isZeroU ? 0 : d.startUnit + heightU - 1,
        heightU,
        width: isZeroU ? (tmpl?.pduWidth || 46) : 482.6,
        depth: d.device3D?.depth ?? tmpl?.default3D?.depth ?? (isZeroU ? 50 : 750),
        height: isZeroU ? 1800 : heightU * 44.45,
        weight: isZeroU ? 5.5 : heightU * 12.5, // approx kg
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        rotation: 0,
        powerWatts: d.powerWatts ?? tmpl?.powerWatts ?? (isZeroU ? 0 : 450),
        powerVA: Math.round((d.powerWatts ?? tmpl?.powerWatts ?? (isZeroU ? 0 : 450)) * 1.08),
        psuCount: category === 'compute' ? 2 : (category === 'power' ? 0 : 1),
        psuRedundancy: category === 'compute' ? '1+1' : 'None',
        airflowDirection: isZeroU ? 'Passive' : 'Front-to-Back',
        frontRearOrientation: 'Front',
        status: 'Active',
        notes: isZeroU ? '0U Side-Mount Equipment' : d.description,
      };

      // Check HA Pair heuristic
      if (d.name.toLowerCase().includes('hv-node1') || d.name.toLowerCase().includes('server-a')) {
        const peer = appState.devices.find(
          x => x.name.toLowerCase().includes('hv-node2') || x.name.toLowerCase().includes('server-b')
        );
        if (peer) obj.haPairId = peer.id;
      }

      objects.push(obj);

      // Map Ports
      for (const p of d.ports || []) {
        let label = p.name;
        if (!label || label.trim() === '' || label === p.id) {
          if (p.id.includes('-ear-left-nic')) {
            const m = /-ear-left-nic(\d+)$/.exec(p.id);
            label = m ? `Left Ear NIC ${m[1]}` : 'Left Ear NIC';
          } else if (p.id.includes('-ear-right-nic')) {
            const m = /-ear-right-nic(\d+)$/.exec(p.id);
            label = m ? `Right Ear NIC ${m[1]}` : 'Right Ear NIC';
          } else if (p.id.includes('-ear-right-mgmt') || p.id.includes('-mgmt')) {
            label = 'Right Ear Mgmt (iDRAC)';
          } else if (p.id.includes('-port-')) {
            const m = /-port-(\d+)$/.exec(p.id);
            label = m ? `Port ${parseInt(m[1], 10) + 1}` : 'Port';
          } else {
            label = p.type ? `${p.type.toUpperCase()} Port` : 'Port';
          }
        }

        const isEarPower =
          p.id.includes('-ear-') &&
          (p.type === 'power' ||
            label.toLowerCase().includes('power') ||
            p.id.toLowerCase().includes('power'));

        const portObj: PhysicalPort = {
          portId: p.id,
          objectId: d.id,
          portGroup: isEarPower ? 'Power' : (p.group || (p.type === 'management' ? 'Management' : p.type === 'power' ? 'Power' : 'Data')),
          portType: isEarPower ? 'power' : p.type,
          speed: isEarPower ? 'Power' : this.mapSpeed(p.speed, p.type),
          connector: isEarPower ? 'C13' : this.mapConnector(p.type),
          physicalPosition: { x: p.relativeX, y: p.relativeY, side: 'front' },
          label,
          purpose: isEarPower ? 'PSU Power Connection' : (p.description || label),
          status: p.connected ? 'Connected' : 'Available',
        };
        ports.push(portObj);
      }
    }

    // Map Cables
    for (const c of appState.cables || []) {
      let srcPort = ports.find(p => p.portId === c.sourcePortId);
      let destPort = ports.find(p => p.portId === c.destPortId);

      // Resolve synthetic PDU outlet for sourcePortId if not registered
      if (!srcPort && c.sourcePortId?.startsWith('outlet-')) {
        const match = /^outlet-(.+)-(\d+)$/.exec(c.sourcePortId);
        if (match) {
          const pduId = match[1];
          const outletNum = parseInt(match[2], 10) + 1;
          const pduObj = objects.find(o => o.objectId === pduId || o.objectId.includes(pduId) || (pduId.includes('left') && o.objectName.toLowerCase().includes('left')) || (pduId.includes('right') && o.objectName.toLowerCase().includes('right')));
          srcPort = {
            portId: c.sourcePortId,
            objectId: pduObj ? pduObj.objectId : pduId,
            portGroup: 'Power',
            portType: 'power',
            speed: 'Power',
            connector: 'C13',
            physicalPosition: { x: 0, y: 0, side: 'front' },
            label: `Outlet ${outletNum} (C13)`,
            purpose: 'Power Outlet',
            status: 'Connected',
          };
          ports.push(srcPort);
        }
      }

      // Resolve synthetic PDU outlet for destPortId if not registered
      if (!destPort && c.destPortId?.startsWith('outlet-')) {
        const match = /^outlet-(.+)-(\d+)$/.exec(c.destPortId);
        if (match) {
          const pduId = match[1];
          const outletNum = parseInt(match[2], 10) + 1;
          const pduObj = objects.find(o => o.objectId === pduId || o.objectId.includes(pduId) || (pduId.includes('left') && o.objectName.toLowerCase().includes('left')) || (pduId.includes('right') && o.objectName.toLowerCase().includes('right')));
          destPort = {
            portId: c.destPortId,
            objectId: pduObj ? pduObj.objectId : pduId,
            portGroup: 'Power',
            portType: 'power',
            speed: 'Power',
            connector: 'C13',
            physicalPosition: { x: 0, y: 0, side: 'front' },
            label: `Outlet ${outletNum} (C13)`,
            purpose: 'Power Outlet',
            status: 'Connected',
          };
          ports.push(destPort);
        }
      }

      const srcObj = srcPort ? objects.find(o => o.objectId === srcPort.objectId) : null;
      const destObj = destPort ? objects.find(o => o.objectId === destPort.objectId) : null;

      // Detect if this cable is a power connection
      const isPowerCable =
        c.type === 'power' ||
        c.type === 'power-redundant' ||
        c.type === 'c13-power' ||
        c.type === 'c19-power' ||
        c.powerCableType === 'power' ||
        c.sourcePortId?.startsWith('outlet-') ||
        c.destPortId?.startsWith('outlet-') ||
        srcPort?.portType === 'power' ||
        destPort?.portType === 'power' ||
        srcPort?.portGroup === 'Power' ||
        destPort?.portGroup === 'Power' ||
        srcPort?.label?.toLowerCase().includes('power') ||
        destPort?.label?.toLowerCase().includes('power') ||
        srcPort?.portId?.toLowerCase().includes('power') ||
        destPort?.portId?.toLowerCase().includes('power') ||
        (srcObj?.category === 'power' && destObj?.category !== 'power') ||
        (destObj?.category === 'power' && srcObj?.category !== 'power');

      // For data ear ports: inherit speed and connector from connected switch/partner port if available
      if (!isPowerCable) {
        if (srcPort?.portId.includes('-ear-') && !srcPort.portId.includes('mgmt') && destPort && destPort.speed !== '1GbE' && destPort.speed !== 'Management') {
          srcPort.speed = destPort.speed;
          srcPort.connector = destPort.connector;
        } else if (destPort?.portId.includes('-ear-') && !destPort.portId.includes('mgmt') && srcPort && srcPort.speed !== '1GbE' && srcPort.speed !== 'Management') {
          destPort.speed = srcPort.speed;
          destPort.connector = srcPort.connector;
        }
      }

      const cable: PhysicalCable = {
        cableId: c.id,
        sourceObject: srcObj?.objectId || (srcPort ? srcPort.objectId : ''),
        sourcePort: c.sourcePortId || '',
        destinationObject: destObj?.objectId || (destPort ? destPort.objectId : ''),
        destinationPort: c.destPortId || '',
        media: isPowerCable
          ? 'Power'
          : c.type.includes('om') || c.type.includes('fiber')
          ? 'Fiber'
          : c.type.includes('dac')
          ? 'DAC'
          : (srcPort?.connector === 'SFP+' || destPort?.connector === 'SFP+' ? 'DAC' : 'Copper'),
        speed: isPowerCable
          ? 'Power'
          : c.type.includes('qsfp') || c.type.includes('100')
          ? '100GbE'
          : c.type.includes('sfp28') || c.type.includes('25')
          ? '25GbE'
          : srcPort?.speed && srcPort.speed !== '1GbE' && srcPort.speed !== 'Management'
          ? srcPort.speed
          : destPort?.speed && destPort.speed !== '1GbE' && destPort.speed !== 'Management'
          ? destPort.speed
          : c.type.includes('sfp') || c.type.includes('10')
          ? '10GbE'
          : '1GbE',
        connectorA: isPowerCable ? 'C13' : (srcPort?.connector || 'RJ45'),
        connectorB: isPowerCable ? 'C13' : (destPort?.connector || (isPowerCable ? 'C13' : 'RJ45')),
        length: c.length ?? 2.5,
        color: c.color || '#3b82f6',
        primaryRoute: c.sidePreference === 'right' ? 'Right VCM' : 'Left VCM',
        rackA: srcObj?.rackId || '',
        rackB: destObj?.rackId || srcObj?.rackId || '',
        purpose: isPowerCable
          ? 'Power'
          : c.type === 'idrac' || c.type === 'console'
          ? 'Management'
          : 'Production',
        vlan: c.vlan,
        vlanMode: c.vlanMode,
        portGroup: c.portGroup,
        networkRole: c.networkRole,
        status: 'connected',
      };
      cables.push(cable);

      // Power Mappings
      if (isPowerCable) {
        // Determine consumer (e.g., server) and supplier (PDU)
        let consumerObj = srcObj;
        let consumerPort = srcPort;
        let supplierObj = destObj;
        let supplierPort = destPort;

        if (
          srcObj?.category === 'power' ||
          srcPort?.portId?.startsWith('outlet-') ||
          (destPort?.portId.includes('-ear-') && (destPort.portId.includes('power') || destPort.label.toLowerCase().includes('power')))
        ) {
          consumerObj = destObj;
          consumerPort = destPort;
          supplierObj = srcObj;
          supplierPort = srcPort;
        }

        if (consumerObj) {
          const existingConsumerPower = power.filter(p => p.objectId === consumerObj!.objectId);

          // Determine PSU ID (PSU 1 vs PSU 2)
          let psuId = '1';
          let psuLabel = 'PSU 1';

          const portHint = (consumerPort?.portId || '') + ' ' + (consumerPort?.label || '');
          const cableHint = c.name + ' ' + (c.notes || '');

          if (
            portHint.toLowerCase().includes('right') ||
            portHint.toLowerCase().includes('psu2') ||
            portHint.toLowerCase().includes('psu 2') ||
            cableHint.toLowerCase().includes('psu2') ||
            cableHint.toLowerCase().includes('psu 2') ||
            cableHint.toLowerCase().includes('feed b') ||
            cableHint.toLowerCase().includes('feed-b') ||
            c.type === 'power-redundant' ||
            c.sidePreference === 'right' ||
            existingConsumerPower.length === 1
          ) {
            psuId = '2';
            psuLabel = 'PSU 2';
          } else if (
            portHint.toLowerCase().includes('left') ||
            portHint.toLowerCase().includes('psu1') ||
            portHint.toLowerCase().includes('psu 1') ||
            cableHint.toLowerCase().includes('psu1') ||
            cableHint.toLowerCase().includes('psu 1') ||
            existingConsumerPower.length === 0
          ) {
            psuId = '1';
            psuLabel = 'PSU 1';
          } else {
            psuId = String(existingConsumerPower.length + 1);
            psuLabel = `PSU ${psuId}`;
          }

          // Determine Power Feed (A vs B)
          let powerFeed: 'A' | 'B' = 'A';
          const pduNameHint = (supplierObj?.objectName || supplierObj?.objectId || '').toLowerCase();
          const pduPortHint = (supplierPort?.portId || '').toLowerCase();

          if (
            pduNameHint.includes('feed b') ||
            pduNameHint.includes('feed-b') ||
            pduNameHint.includes('-b') ||
            pduNameHint.includes(' b') ||
            pduNameHint.includes('pdu-b') ||
            pduNameHint.includes('right') ||
            pduPortHint.includes('right') ||
            psuId === '2'
          ) {
            powerFeed = 'B';
          } else {
            powerFeed = 'A';
          }

          // If this host already has a PSU on feed A and connects to this PDU, ensure feed B
          if (existingConsumerPower.length === 1 && existingConsumerPower[0].powerFeed === 'A' && powerFeed === 'A') {
            powerFeed = 'B';
          }

          power.push({
            powerId: `pwr-${c.id}`,
            objectId: consumerObj.objectId,
            psuId,
            psuLabel,
            cableId: c.id,
            pduId: supplierObj?.objectId || (supplierPort ? supplierPort.objectId : (powerFeed === 'B' ? 'PDU-B' : 'PDU-A')),
            pduSocketId: supplierPort?.portId || c.destPortId || (powerFeed === 'B' ? 'C13-B1' : 'C13-A1'),
            socketType: 'C13',
            powerFeed,
            powerWatts: Math.round(consumerObj.powerWatts / Math.max(1, consumerObj.psuCount || 2)),
            redundancyStatus: 'redundant',
          });
        }
      }
    }

    return {
      project: {
        projectId: 'proj-imported',
        projectName: 'Active Rack Elevation Infrastructure',
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        version: '1.0.0',
        status: 'draft',
      },
      racks,
      objects,
      ports,
      connections: [],
      cables,
      power,
      failureDomains: [
        { domainId: 'FD-A', domainName: 'Power & Cabinet Zone A', type: 'rack', memberObjectIds: [] },
        { domainId: 'FD-B', domainName: 'Power & Cabinet Zone B', type: 'rack', memberObjectIds: [] },
      ],
      proposals: typeof physicalInfrastructureModel !== 'undefined' && physicalInfrastructureModel ? physicalInfrastructureModel.getProposals() : [],
    };
  }

  /**
   * Synchronizes an existing Physical Infrastructure Model back into AppState format
   * so 2D elevation, 3D viewport, and export systems render the identical state.
   */
  static toAppState(model: PhysicalInfrastructureModel, currentState: AppState): Partial<AppState> {
    const racks: RackData[] = model.getRacks().map(pr => {
      const existing = currentState.racks.find(r => r.id === pr.rackId);
      return {
        id: pr.rackId,
        name: pr.rackName,
        units: pr.rackSizeU,
        x: pr.rackPositionX || existing?.x || 250,
        y: pr.rackPositionY || existing?.y || 80,
        rackWidth: pr.rackWidth === 800 ? '23-inch' : '19-inch',
        depthMm: pr.rackDepth,
        leftCableManagerWidth: existing?.leftCableManagerWidth ?? '4-inch',
        rightCableManagerWidth: existing?.rightCableManagerWidth ?? '4-inch',
        pduCapacityWatts: Math.round(pr.powerCapacity / 2),
      };
    });

    const devices: DeviceData[] = model.getObjects().map(obj => {
      const existing = currentState.devices.find(d => d.id === obj.objectId);
      const tmpl = existing?.templateId
        ? getTemplate(existing.templateId)
        : (obj.category === 'network' ? getTemplate('switch-32p') : getTemplate('server-2u-enterprise'));

      const modelPorts = model.getPorts(obj.objectId);
      const ports: PortData[] = modelPorts.map((mp, idx) => ({
        id: mp.portId,
        deviceId: obj.objectId,
        name: mp.label,
        type: (mp.portType as any) || 'rj45',
        relativeX: mp.physicalPosition?.x ?? 50 + idx * 15,
        relativeY: mp.physicalPosition?.y ?? 10,
        speed: mp.speed,
        connected: mp.status === 'Connected',
        cableId: null,
      }));

      return {
        id: obj.objectId,
        templateId: existing?.templateId || (tmpl?.id ?? 'server-2u-enterprise'),
        rackId: obj.rackId,
        startUnit: obj.uStart,
        name: obj.objectName,
        hostname: existing?.hostname || obj.objectName.toLowerCase().replace(/\s+/g, '-'),
        managementIp: existing?.managementIp || '10.0.0.10',
        serialNumber: obj.serialNumber || '',
        description: obj.notes || '',
        ports: ports.length > 0 ? ports : (existing?.ports || []),
        powerWatts: obj.powerWatts,
      };
    });

    const cables: CableData[] = model.getCables().map(c => {
      const existing = currentState.cables.find(cb => cb.id === c.cableId);
      return {
        id: c.cableId,
        name: existing?.name || `Cable ${c.cableId}`,
        type: c.purpose === 'Management' ? 'idrac' : c.media === 'Power' ? 'power' : 'general',
        color: c.color,
        sourcePortId: c.sourcePort,
        destPortId: c.destinationPort,
        bendPoints: existing?.bendPoints || [],
        thickness: existing?.thickness || 2.2,
        bendRadius: existing?.bendRadius || 22,
        bundleId: existing?.bundleId || null,
        notes: c.purpose,
        vlan: c.vlan || existing?.vlan,
        vlanMode: c.vlanMode || existing?.vlanMode,
        portGroup: c.portGroup || existing?.portGroup,
        networkRole: c.networkRole || existing?.networkRole,
        anchorPoints: existing?.anchorPoints || [],
        anchorsLocked: existing?.anchorsLocked || false,
      };
    });

    return {
      racks,
      devices,
      cables,
    };
  }

  private static mapCategory(cat: string): ObjectCategory {
    switch (cat.toLowerCase()) {
      case 'server': return 'compute';
      case 'storage': return 'storage';
      case 'switch':
      case 'patch-panel':
      case 'cable-manager': return 'network';
      case 'router': return 'routing';
      case 'firewall':
      case 'nac':
      case 'ids-ips':
      case 'proxy-waf': return 'security';
      case 'load-balancer': return 'application';
      case 'pdu':
      case 'ups':
      case 'ats': return 'power';
      case 'cooling': return 'cooling';
      case 'console': return 'infrastructure';
      default: return 'compute';
    }
  }

  private static mapSpeed(speed?: string, type?: string): PortSpeed {
    if (speed) {
      const s = speed.toLowerCase();
      if (s.includes('400')) return '400GbE';
      if (s.includes('100')) return '100GbE';
      if (s.includes('40')) return '40GbE';
      if (s.includes('25')) return '25GbE';
      if (s.includes('10')) return '10GbE';
      if (s.includes('1')) return '1GbE';
    }
    const t = (type || '').toLowerCase();
    if (t.includes('qsfp28') || t.includes('100g')) return '100GbE';
    if (t.includes('qsfp') || t.includes('40g')) return '40GbE';
    if (t.includes('sfp28') || t.includes('25g')) return '25GbE';
    if (t.includes('sfp+') || t.includes('sfp-plus') || t.includes('10g')) return '10GbE';
    if (t.includes('sfp')) return '1GbE';
    if (t.includes('management') || t.includes('idrac') || t.includes('ilo') || t.includes('bmc')) return 'Management';
    if (t.includes('console')) return 'Console';
    if (t.includes('power')) return 'Power';
    return '1GbE';
  }

  private static mapConnector(type: string): ConnectorType {
    const t = (type || '').toLowerCase();
    if (t.includes('qsfp28')) return 'QSFP28';
    if (t.includes('qsfp')) return 'QSFP+';
    if (t.includes('sfp28')) return 'SFP28';
    if (t.includes('sfp+') || t.includes('sfp-plus')) return 'SFP+';
    if (t.includes('sfp')) return 'SFP';
    if (t.includes('power') || t.includes('c13') || t.includes('c14')) return 'C13';
    if (t.includes('c19') || t.includes('c20')) return 'C19';
    if (t.includes('lc')) return 'LC';
    if (t.includes('mpo')) return 'MPO';
    return 'RJ45';
  }
}
